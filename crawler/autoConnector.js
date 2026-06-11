// Self-adapting connector for career sites with NO hand-written connector.
//
// Strategy ("learn once, cache, reuse"):
//   1. Cached adapter for this domain?  → run it (no LLM cost).
//   2. Else LEARN: fetch the page and look, in order, for
//        a) JSON-LD JobPosting   (deterministic, no LLM)
//        b) embedded <script type=application/json> job data  (LLM maps once)
//        c) a discoverable JSON jobs API referenced by the page (LLM maps once)
//      then cache the adapter spec keyed by domain.
//
// No headless browser — fully JS-rendered SPAs (e.g. Eightfold/Workday) that
// expose nothing to a plain fetch won't yield jobs here by design.
import { finalize, stripHtml, isoDate } from '../src/lib/connectors.js'
import { getAdapter, saveAdapter } from './adapterCache.js'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'
const HAS_LLM = Boolean(process.env.OPENAI_API_KEY)

const toUrl = (u) => (u.startsWith('http') ? u : 'https://' + u)
const domainOf = (u) => new URL(toUrl(u)).hostname
const abs = (base, href) => { try { return new URL(href, toUrl(base)).href } catch { return href } }
const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h) }

function getPath(obj, path) {
  if (!path) return obj
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[/^\d+$/.test(k) ? Number(k) : k]), obj)
}

async function fetchText(url) {
  const r = await fetch(toUrl(url), { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' } })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.text()
}
async function fetchJson(url) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
    if (!r.ok) return null
    return JSON.parse(await r.text())
  } catch { return null }
}

// ---------- JSON-LD ----------
export function extractJsonLd(html) {
  const out = []
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m
  while ((m = re.exec(html))) {
    try {
      const j = JSON.parse(m[1].trim())
      ;(Array.isArray(j) ? j : [j]).forEach((x) => (x['@graph'] ? out.push(...x['@graph']) : out.push(x)))
    } catch { /* skip */ }
  }
  const isJob = (o) => o && (o['@type'] === 'JobPosting' || (Array.isArray(o['@type']) && o['@type'].includes('JobPosting')))
  return out.filter(isJob)
}
function jobFromJsonLd(o, company) {
  const L = Array.isArray(o.jobLocation) ? o.jobLocation[0] : o.jobLocation
  const a = L?.address || {}
  const loc = [a.addressLocality, a.addressRegion, a.addressCountry].filter(Boolean).join(', ')
  const id = o.identifier?.value || o.identifier || o.url || hash(JSON.stringify(o))
  return finalize({
    job_id: `auto-${company.slug || domainOf(company.url)}-${id}`,
    title: o.title,
    location: loc,
    remote: /remote/i.test(`${o.jobLocationType || ''} ${loc}`) ? 'Remote' : 'On-site',
    employment_type: Array.isArray(o.employmentType) ? o.employmentType[0] : o.employmentType || 'Full-time',
    department: o.occupationalCategory || o.industry || '',
    apply_url: o.url || toUrl(company.url),
    posted_date: isoDate(o.datePosted),
    description: stripHtml(o.description || '').slice(0, 1500),
    source: 'auto',
  }, company)
}

// ---------- embedded JSON / API discovery ----------
function extractJsonScripts(html) {
  const out = []
  const re = /<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m
  while ((m = re.exec(html))) { try { out.push(JSON.parse(m[1].trim())) } catch { /* skip */ } }
  return out
}
function apiCandidates(html, base) {
  const urls = new Set()
  const re = /["'`]((?:https?:\/\/)?\/?[^"'`\s]*(?:job|position|posting|opening|vacanc|search|career)[^"'`\s]*)["'`]/gi
  let m
  while ((m = re.exec(html))) {
    const raw = m[1]
    if (!/^https?:/.test(raw) && !raw.startsWith('/')) continue
    const full = abs(base, raw)
    if (/\.(js|css|png|jpe?g|svg|woff2?|gif|ico|map)(\?|$)/i.test(full)) continue
    urls.add(full)
  }
  return [...urls].slice(0, 8)
}

const MAP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    list_path: { type: 'string' },
    fields: {
      type: 'object',
      additionalProperties: false,
      properties: {
        title: { type: 'string' }, location: { type: 'string' }, department: { type: 'string' },
        employment_type: { type: 'string' }, apply_url: { type: 'string' },
        description: { type: 'string' }, posted_date: { type: 'string' },
      },
      required: ['title', 'location', 'department', 'employment_type', 'apply_url', 'description', 'posted_date'],
    },
  },
  required: ['list_path', 'fields'],
}

export async function llmMap(payload) {
  const { default: OpenAI } = await import('openai')
  const client = new OpenAI()
  const sample = JSON.stringify(payload).slice(0, 12000)
  const r = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content:
        'You map a JSON payload of job postings to extraction paths. list_path is the dot-path to the ARRAY of job objects within the payload ("" if the payload itself is the array). Each field is a dot-path WITHIN one job object ("" if absent). Use numeric segments for array indices. Prefer human-readable values.' },
      { role: 'user', content: `Payload sample:\n${sample}` },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'adapter', strict: true, schema: MAP_SCHEMA } },
  })
  return JSON.parse(r.choices[0].message.content)
}

export function jobsFromMapping(payload, mapping, company) {
  const arr = mapping.list_path ? getPath(payload, mapping.list_path) : payload
  if (!Array.isArray(arr)) return []
  const f = mapping.fields
  return arr.map((item, i) => {
    const g = (p) => (p ? getPath(item, p) : undefined)
    const title = g(f.title)
    if (!title) return null
    let apply = g(f.apply_url)
    if (apply && !/^https?:/.test(String(apply))) apply = abs(company.url, String(apply))
    const loc = String(g(f.location) || '')
    return finalize({
      job_id: `auto-${company.slug || domainOf(company.url)}-${apply || g(f.title) + '-' + i}`,
      title: String(title),
      location: loc,
      remote: /remote/i.test(loc) ? 'Remote' : 'On-site',
      employment_type: String(g(f.employment_type) || 'Full-time'),
      department: String(g(f.department) || ''),
      apply_url: apply || toUrl(company.url),
      posted_date: isoDate(g(f.posted_date)),
      description: stripHtml(String(g(f.description) || '')).slice(0, 1500),
      source: 'auto',
    }, company)
  }).filter(Boolean)
}

const looksJobby = (s) => /job|position|title|opening|vacanc/i.test(s)

// Run a previously-learned adapter (cheap, no LLM).
async function runAdapter(spec, company, base) {
  if (spec.type === 'jsonld') return extractJsonLd(await fetchText(base)).map((o) => jobFromJsonLd(o, company))
  if (spec.type === 'api') {
    const payload = await fetchJson(spec.url)
    return payload ? jobsFromMapping(payload, spec.mapping, company) : []
  }
  if (spec.type === 'embedded') {
    const payload = extractJsonScripts(await fetchText(base))[spec.index]
    return payload ? jobsFromMapping(payload, spec.mapping, company) : []
  }
  return []
}

// Learn an adapter from scratch.
async function learn(company, base) {
  const html = await fetchText(base)

  const ld = extractJsonLd(html)
  if (ld.length) return { spec: { type: 'jsonld' }, jobs: ld.map((o) => jobFromJsonLd(o, company)) }

  if (HAS_LLM) {
    // embedded JSON blocks
    const scripts = extractJsonScripts(html)
    for (let i = 0; i < scripts.length; i++) {
      const str = JSON.stringify(scripts[i])
      if (str.length < 200 || !looksJobby(str.slice(0, 3000))) continue
      try {
        const mapping = await llmMap(scripts[i])
        const jobs = jobsFromMapping(scripts[i], mapping, company)
        if (jobs.length) return { spec: { type: 'embedded', index: i, mapping }, jobs }
      } catch { /* try next */ }
    }
    // discoverable JSON APIs
    for (const url of apiCandidates(html, base)) {
      const payload = await fetchJson(url)
      if (!payload) continue
      const str = JSON.stringify(payload)
      if (str.length < 100 || !looksJobby(str.slice(0, 3000))) continue
      try {
        const mapping = await llmMap(payload)
        const jobs = jobsFromMapping(payload, mapping, company)
        if (jobs.length) return { spec: { type: 'api', url, mapping }, jobs }
      } catch { /* try next */ }
    }
  }
  return null
}

// Public entry: fetch jobs for a company with no built-in connector.
export async function autoFetch(company) {
  const base = toUrl(company.url)
  const dom = domainOf(base)

  const cached = await getAdapter(dom)
  if (cached) {
    try {
      const jobs = await runAdapter(cached, company, base)
      if (jobs.length) return jobs
    } catch { /* adapter stale — re-learn */ }
  }

  const learned = await learn(company, base)
  if (learned) {
    await saveAdapter(dom, learned.spec)
    return learned.jobs
  }
  return []
}
