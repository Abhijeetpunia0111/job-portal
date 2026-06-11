// AI enrichment: use an LLM to extract structured fields from each job
// description and write them back to Supabase.
//
//   node crawler/enrich.js            -> enrich all not-yet-enriched jobs
//   node crawler/enrich.js --all      -> re-enrich every job
//   node crawler/enrich.js --limit 50 -> cap how many jobs to process
//
// Provider is auto-selected by which key is present (override with ENRICH_PROVIDER):
//   OPENAI_API_KEY     -> OpenAI    (default model gpt-4o-mini, OPENAI_MODEL to override)
//   ANTHROPIC_API_KEY  -> Anthropic (default model claude-opus-4-8, ANTHROPIC_MODEL to override)
// Server-side only — keys are never shipped to the browser.
import 'dotenv/config'
import { admin } from './supabaseAdmin.js'

const CONCURRENCY = Number(process.env.ENRICH_CONCURRENCY || 5)

// ---- provider selection ----
const PROVIDER =
  process.env.ENRICH_PROVIDER ||
  (process.env.OPENAI_API_KEY ? 'openai' : process.env.ANTHROPIC_API_KEY ? 'anthropic' : null)

if (!PROVIDER) {
  console.error('\n  No LLM key found. Set OPENAI_API_KEY (or ANTHROPIC_API_KEY) in .env.\n')
  process.exit(1)
}

// Structured-output schema (strict-mode compatible: additionalProperties:false,
// every field required, no min/max/length keywords).
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    required_skills: { type: 'array', items: { type: 'string' } },
    tech_stack: { type: 'array', items: { type: 'string' } },
    experience_min_years: { type: 'integer' },
    experience_max_years: { type: 'integer' },
    seniority: {
      type: 'string',
      enum: ['Intern', 'Junior', 'Mid', 'Senior', 'Staff', 'Lead', 'Principal'],
    },
    job_category: {
      type: 'string',
      enum: ['Engineering', 'Data', 'Product', 'Design', 'Infrastructure',
        'Sales', 'Marketing', 'People', 'Finance', 'Operations', 'Other'],
    },
    summary: { type: 'string' },
  },
  required: [
    'required_skills', 'tech_stack', 'experience_min_years',
    'experience_max_years', 'seniority', 'job_category', 'summary',
  ],
}

const SYSTEM =
  'You are a recruiting analyst. Extract structured hiring metadata from a job ' +
  'posting. Infer reasonable values from the title when the description is thin. ' +
  'experience_*_years are total years of professional experience expected ' +
  '(use 0 for entry-level). Keep tech_stack to concrete technologies; ' +
  'required_skills may include soft/role skills. summary is one sentence.'

function userPrompt(job) {
  return (
    `Title: ${job.title}\nCompany: ${job.company}\nLocation: ${job.location}\n` +
    `Department: ${job.department || 'n/a'}\n\nDescription:\n${job.description || '(none provided)'}`
  )
}

// ---- OpenAI path ----
async function makeOpenAI() {
  const { default: OpenAI } = await import('openai')
  const client = new OpenAI()
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
  return async (job) => {
    const res = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: userPrompt(job) },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'job_enrichment', strict: true, schema: SCHEMA },
      },
    })
    return JSON.parse(res.choices[0].message.content)
  }
}

// ---- Anthropic path ----
async function makeAnthropic() {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic()
  const model = process.env.ANTHROPIC_MODEL || 'claude-opus-4-8'
  return async (job) => {
    const res = await client.messages.create({
      model,
      max_tokens: 1024,
      thinking: { type: 'disabled' },
      system: SYSTEM,
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: userPrompt(job) }],
    })
    const text = res.content.find((b) => b.type === 'text')?.text || '{}'
    return JSON.parse(text)
  }
}

// Run an async mapper over items with bounded concurrency.
async function pool(items, limit, worker) {
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) await worker(items[cursor++])
  })
  await Promise.all(runners)
}

async function main() {
  const all = process.argv.includes('--all')
  const limitIdx = process.argv.indexOf('--limit')
  const limit = limitIdx !== -1 ? Number(process.argv[limitIdx + 1]) : 1000

  const enrichOne = PROVIDER === 'openai' ? await makeOpenAI() : await makeAnthropic()
  const modelLabel = PROVIDER === 'openai'
    ? process.env.OPENAI_MODEL || 'gpt-4o-mini'
    : process.env.ANTHROPIC_MODEL || 'claude-opus-4-8'

  let q = admin.from('jobs').select('*').limit(limit)
  if (!all) q = q.is('job_category', null) // only un-enriched
  const { data: jobs, error } = await q
  if (error) throw error

  if (!jobs?.length) {
    console.log('\nNothing to enrich.\n')
    return
  }

  console.log(`\nEnriching ${jobs.length} jobs via ${PROVIDER} (${modelLabel}), concurrency ${CONCURRENCY}…\n`)
  let ok = 0
  let failed = 0

  await pool(jobs, CONCURRENCY, async (job) => {
    try {
      const e = await enrichOne(job)
      const { error: upErr } = await admin
        .from('jobs')
        .update({
          required_skills: e.required_skills,
          tech_stack: e.tech_stack,
          experience_min: e.experience_min_years,
          experience_max: e.experience_max_years,
          ai_seniority: e.seniority,
          job_category: e.job_category,
          ai_summary: e.summary,
          enriched_at: new Date().toISOString(),
        })
        .eq('job_id', job.job_id)
      if (upErr) throw upErr
      ok++
      if (ok % 25 === 0) console.log(`  …${ok} enriched`)
    } catch (err) {
      failed++
      console.log(`  ✗ ${job.job_id}: ${err.message}`)
    }
  })

  console.log(`\nDone. ${ok} enriched, ${failed} failed.\n`)
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e)
  process.exit(1)
})
