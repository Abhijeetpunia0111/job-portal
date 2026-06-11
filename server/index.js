// Local API server for resume↔job matching. Keeps the OpenAI key server-side.
//   npm run server   ->  http://localhost:8787
// The Vite dev server proxies /api to this (see vite.config.js).
import 'dotenv/config'
import { fileURLToPath } from 'node:url'
import express from 'express'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import { drainLinkedInQueue } from '../crawler/linkedin.js'

// True only when this file is run directly (local `npm run server`). On Vercel
// it's imported by api/index.js as a serverless handler, so we must NOT start a
// listener or background intervals there — that work moves to Vercel Cron.
const isMain = Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === process.argv[1]

const app = express()
app.use(express.json({ limit: '8mb' }))

// ---------------- LinkedIn queue auto-processing ----------------
// The browser can't scrape LinkedIn, so the server does it. It auto-drains the
// queue on an interval (no manual `npm run linkedin` needed) and the frontend
// can also POST /api/linkedin/drain to process immediately after queuing.
const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const admin = SB_URL && SB_KEY ? createClient(SB_URL, SB_KEY, { auth: { persistSession: false } }) : null

const DRAIN_INTERVAL_MS = 60_000          // auto-check the queue every minute
const PURGE_INTERVAL_MS = 24 * 60 * 60_000 // empty the queue table every 24 hours
let draining = false                       // simple lock so drains never overlap

async function runDrain() {
  if (!admin || draining) return { processed: 0, ok: 0, failed: 0, skipped: true }
  draining = true
  try {
    const result = await drainLinkedInQueue(admin, { limit: 25, max: 25 })
    if (result.processed) {
      console.log(`[linkedin] drained ${result.processed} item(s): ${result.ok} ok, ${result.failed} failed`)
    }
    return result
  } catch (err) {
    console.error('[linkedin] drain error:', err.message)
    return { processed: 0, ok: 0, failed: 0, error: err.message }
  } finally {
    draining = false
  }
}

async function purgeQueue() {
  if (!admin) return
  const { error } = await admin.from('linkedin_queue').delete().neq('id', 0)
  if (error) console.error('[linkedin] purge error:', error.message)
  else console.log('[linkedin] queue table cleared (24h purge)')
}

// Background timers only make sense on an always-on server (local dev). On
// Vercel these are driven by Vercel Cron hitting the GET endpoints below.
if (isMain) {
  if (admin) {
    setInterval(runDrain, DRAIN_INTERVAL_MS)
    setInterval(purgeQueue, PURGE_INTERVAL_MS)
    runDrain() // process anything already pending on startup
    console.log(`LinkedIn queue: auto-drain every ${DRAIN_INTERVAL_MS / 1000}s, purge every 24h`)
  } else {
    console.log('LinkedIn queue: Supabase not configured — auto-drain disabled')
  }
}

// Trigger an immediate drain (called by the frontend right after queuing).
app.post('/api/linkedin/drain', async (_req, res) => {
  if (!admin) return res.status(400).json({ error: 'Supabase not configured on the server' })
  const result = await runDrain()
  res.json(result)
})

// Cron-friendly GET endpoints (Vercel Cron sends GET). Configured in vercel.json.
app.get('/api/cron/drain', async (_req, res) => {
  if (!admin) return res.status(400).json({ error: 'Supabase not configured' })
  res.json(await runDrain())
})
app.get('/api/cron/purge', async (_req, res) => {
  if (!admin) return res.status(400).json({ error: 'Supabase not configured' })
  await purgeQueue()
  res.json({ ok: true })
})

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'
const hasKey = Boolean(process.env.OPENAI_API_KEY)
const client = hasKey ? new OpenAI() : null

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    match_percent: { type: 'integer' },               // 0–100 overall fit
    verdict: { type: 'string' },                       // one-line summary
    matched_skills: { type: 'array', items: { type: 'string' } },
    missing_skills: { type: 'array', items: { type: 'string' } },
    strengths: { type: 'array', items: { type: 'string' } },
    gaps: { type: 'array', items: { type: 'string' } },
    suggestions: { type: 'array', items: { type: 'string' } }, // concrete resume edits
  },
  required: ['match_percent', 'verdict', 'matched_skills', 'missing_skills', 'strengths', 'gaps', 'suggestions'],
}

const SYSTEM =
  'You are an expert technical recruiter and resume coach. Compare a candidate resume ' +
  'against a job description. Score overall fit 0–100 based on skills, experience, ' +
  'seniority, and domain. matched_skills = JD requirements the resume clearly evidences; ' +
  'missing_skills = JD requirements absent or weak in the resume. strengths/gaps are short ' +
  'phrases. suggestions are specific, actionable resume edits (rephrase a bullet, add a ' +
  'metric, surface a skill) — not generic advice. Be honest; do not inflate the score.'

async function extractResumeText(body) {
  if (body.resumeText && body.resumeText.trim()) return body.resumeText
  if (body.file?.base64) {
    const buf = Buffer.from(body.file.base64, 'base64')
    const name = (body.file.name || '').toLowerCase()
    if (name.endsWith('.pdf')) {
      const { PDFParse } = await import('pdf-parse')
      const parser = new PDFParse({ data: new Uint8Array(buf) })
      try {
        const out = await parser.getText()
        return out.text || ''
      } finally {
        await parser.destroy?.()
      }
    }
    return buf.toString('utf8') // .txt / .md
  }
  return ''
}

app.get('/api/health', (_req, res) => res.json({ ok: true, model: MODEL, hasKey }))

app.post('/api/match', async (req, res) => {
  if (!client) return res.status(500).json({ error: 'OPENAI_API_KEY is not set in .env' })
  try {
    const resume = (await extractResumeText(req.body)).replace(/\s+/g, ' ').trim().slice(0, 15000)
    const jd = String(req.body.jobText || '').trim().slice(0, 8000)
    if (!resume) return res.status(400).json({ error: 'No résumé text found (paste text or upload a .pdf/.txt).' })
    if (!jd) return res.status(400).json({ error: 'No job description provided.' })

    const r = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `JOB DESCRIPTION:\n${jd}\n\n---\n\nRÉSUMÉ:\n${resume}` },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'resume_match', strict: true, schema: SCHEMA } },
    })
    res.json(JSON.parse(r.choices[0].message.content))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ---- Draft an outreach / application email from a résumé + job description ----
const EMAIL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    subject: { type: 'string' },                       // concise email subject line
    body: { type: 'string' },                          // full email body, ready to send
  },
  required: ['subject', 'body'],
}

const EMAIL_SYSTEM =
  'You write concise, professional job-application / outreach emails on behalf of a candidate. ' +
  'Read the candidate résumé and the target job, then draft an email to the hiring manager or ' +
  'recruiter expressing genuine interest in THIS specific role. Requirements: (1) Lead with a ' +
  'one-line hook tying the candidate to the role. (2) Cite 2–3 concrete, relevant achievements or ' +
  'skills FROM THE RÉSUMÉ that map to the job\'s needs — never invent experience. (3) Keep it ~120–180 ' +
  'words, warm but professional, no fluff or clichés. (4) End with a clear, low-friction ask (a brief ' +
  'call / consideration) and a sign-off using the candidate\'s name from the résumé. Use the candidate\'s ' +
  'real name if present; otherwise use "[Your Name]". Do not fabricate the recipient\'s name — open with ' +
  '"Hi [Hiring Manager name]" only as a placeholder if none is known. Return JSON: subject and body.'

app.post('/api/email', async (req, res) => {
  if (!client) return res.status(500).json({ error: 'OPENAI_API_KEY is not set in .env' })
  try {
    const resume = (await extractResumeText(req.body)).replace(/\s+/g, ' ').trim().slice(0, 15000)
    const jd = String(req.body.jobText || '').trim().slice(0, 8000)
    if (!resume) return res.status(400).json({ error: 'No résumé text found (paste text or upload a .pdf/.txt).' })
    if (!jd) return res.status(400).json({ error: 'No job description provided.' })

    const r = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: EMAIL_SYSTEM },
        { role: 'user', content: `TARGET JOB:\n${jd}\n\n---\n\nCANDIDATE RÉSUMÉ:\n${resume}` },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'outreach_email', strict: true, schema: EMAIL_SCHEMA } },
    })
    res.json(JSON.parse(r.choices[0].message.content))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ---- Normalize a pasted Naukri (or any) job posting into the unified schema ----
// Naukri can't be scraped (recaptcha), so the user pastes the URL + the posting
// text and we structure it with the LLM.
const NAUKRI_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    company: { type: 'string' },
    location: { type: 'string' },
    country: { type: 'string' },
    remote: { type: 'string', enum: ['Remote', 'Hybrid', 'On-site'] },
    employment_type: { type: 'string' },                // Full-time, Contract, Internship, …
    department: { type: 'string' },
    seniority: { type: 'string' },                      // e.g. Entry, Mid, Senior
    salary: { type: 'string' },                         // human string, '' if absent
    salary_min: { type: ['integer', 'null'] },
    salary_max: { type: ['integer', 'null'] },
    skills: { type: 'array', items: { type: 'string' } },
    posted_date: { type: 'string' },                    // YYYY-MM-DD or ''
  },
  required: ['title', 'company', 'location', 'country', 'remote', 'employment_type',
    'department', 'seniority', 'salary', 'salary_min', 'salary_max', 'skills', 'posted_date'],
}

const NAUKRI_SYSTEM =
  'You extract structured fields from a pasted job posting (often from Naukri.com). ' +
  'Return ONLY what the text supports — never invent. Rules: country = the country of the ' +
  'location (e.g. "India"); remote = Remote | Hybrid | On-site inferred from the text (default ' +
  'On-site if unstated); employment_type like "Full-time"/"Contract"/"Internship"; seniority a ' +
  'short label (Fresher/Entry/Mid/Senior/Lead) inferred from required experience; salary = the ' +
  'salary string if present (Naukri often shows ranges like "₹8-12 LPA"), else ""; salary_min/max ' +
  'as integer rupees-per-year if a numeric range is given (e.g. 8 LPA -> 800000), else null; skills ' +
  '= concrete skills/tools listed; posted_date in YYYY-MM-DD — resolve relative dates ("2 days ago", ' +
  '"posted today") against the TODAY date given in the user message; use "" if no date is present. ' +
  'Never guess a date. Use "" or [] for anything missing.'

app.post('/api/naukri/import', async (req, res) => {
  if (!client) return res.status(500).json({ error: 'OPENAI_API_KEY is not set in .env' })
  try {
    const url = String(req.body.url || '').trim()
    const text = String(req.body.description || '').replace(/\s+/g, ' ').trim().slice(0, 12000)
    if (!text) return res.status(400).json({ error: 'Paste the job description text to import.' })

    const r = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: NAUKRI_SYSTEM },
        { role: 'user', content: `TODAY: ${new Date().toISOString().slice(0, 10)}\nJOB URL: ${url || '(none)'}\n\nJOB POSTING TEXT:\n${text}` },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'naukri_job', strict: true, schema: NAUKRI_SCHEMA } },
    })
    const f = JSON.parse(r.choices[0].message.content)

    // Stable id: trailing number in the URL, else a short hash of url+title.
    const idMatch = url.match(/(\d{6,})(?:[/?#]|$)/)
    let id = idMatch ? idMatch[1] : null
    if (!id) {
      let h = 0
      for (const ch of `${url}|${f.title}|${f.company}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0
      id = h.toString(36)
    }

    const job = {
      job_id: `naukri-${id}`,
      title: f.title,
      company: f.company || 'Unknown',
      location: f.location || '',
      country: f.country || '',
      remote: f.remote || 'On-site',
      employment_type: f.employment_type || 'Full-time',
      department: f.department || '',
      seniority: f.seniority || '',
      salary: f.salary || '',
      salary_min: f.salary_min ?? null,
      salary_max: f.salary_max ?? null,
      skills: Array.isArray(f.skills) ? f.skills : [],
      description: String(req.body.description || '').trim().slice(0, 8000),
      apply_url: url,
      linkedin_url: '',
      source: 'naukri',
      posted_date: f.posted_date || '',
    }
    res.json({ job })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Start a listener only for local dev. On Vercel the app is imported as a
// serverless function (see api/index.js) and Vercel handles the HTTP layer.
if (isMain) {
  const PORT = process.env.MATCH_PORT || 8787
  app.listen(PORT, () => {
    console.log(`Resume-match API on http://localhost:${PORT}  (model: ${MODEL}${hasKey ? '' : ', NO OPENAI KEY'})`)
  })
}

export default app
