// LinkedIn job parser — USER-PROVIDED URLs ONLY.
//
// Flow (the authorized approach): a user supplies a LinkedIn job listing URL
// they can access; we fetch that single job's PUBLIC guest page (the same
// no-login page LinkedIn serves to logged-out visitors) and parse its
// structured fields into the unified schema.
//
//   node crawler/linkedin.js <url> [<url> ...]   # parse given URLs
//   node crawler/linkedin.js <search-url> --limit 10
//   node crawler/linkedin.js                     # drain the linkedin_queue table (Supabase)
//   node crawler/linkedin.js --limit 20
//
// If Supabase env is set, parsed jobs are upserted into `jobs`; otherwise the
// normalized JSON is printed (so it works standalone for a quick look).
//
// This is deliberately low-volume and user-initiated. It does NOT log in,
// rotate proxies, or evade bot detection. Search pages are expanded only from
// public job IDs present in that page's markup and capped by --limit.
import 'dotenv/config'
import * as cheerio from 'cheerio'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36'

const HAS_SUPABASE = Boolean(
  (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL) && process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ---- small normalizers (kept local so this module stands alone) ----
function guessCountry(loc = '') {
  const l = loc.toLowerCase()
  if (/india|bengaluru|bangalore|mumbai|delhi|hyderabad|pune|gurgaon|noida/.test(l)) return 'India'
  if (/germany|berlin|munich|münchen|hamburg|frankfurt/.test(l)) return 'Germany'
  if (/united kingdom|\buk\b|london|manchester|england/.test(l)) return 'UK'
  if (/canada|toronto|vancouver|montreal|ontario/.test(l)) return 'Canada'
  if (/ireland|dublin/.test(l)) return 'Ireland'
  if (/singapore/.test(l)) return 'Singapore'
  if (/australia|sydney|melbourne/.test(l)) return 'Australia'
  if (/united states|, [a-z]{2}\b|new york|san francisco|seattle|austin|boston|remote/.test(l)) return 'USA'
  return 'Other'
}

function remoteMode(loc = '', workplace = '') {
  const s = `${loc} ${workplace}`.toLowerCase()
  if (s.includes('remote')) return 'Remote'
  if (s.includes('hybrid')) return 'Hybrid'
  return 'On-site'
}

// "2 weeks ago" / "Reposted 3 days ago" / "Just now" -> approximate ISO date.
function relativeToIso(text = '') {
  const t = text.toLowerCase()
  const now = new Date()
  if (/just now|today|hour|minute|second/.test(t)) return now.toISOString().slice(0, 10)
  const m = t.match(/(\d+)\s*(day|week|month|year)/)
  if (!m) return ''
  const n = Number(m[1])
  const days = { day: 1, week: 7, month: 30, year: 365 }[m[2]] * n
  return new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10)
}

// Accepts a full LinkedIn URL or a bare numeric id; returns the job id.
export function extractJobId(input = '') {
  const s = String(input).trim()
  if (/^\d+$/.test(s)) return s
  // …/jobs/view/title-slug-1234567890  OR  …/jobs/view/1234567890
  const view = s.match(/jobs\/view\/(?:[^/?#]*-)?(\d+)/)
  if (view) return view[1]
  // …?currentJobId=1234567890  (search / collections pages)
  const q = s.match(/[?&]currentJobId=(\d+)/)
  if (q) return q[1]
  // urn:li:jobPosting:1234567890
  const urn = s.match(/jobPosting:(\d+)/)
  if (urn) return urn[1]
  // last resort: any 8+ digit run
  const any = s.match(/(\d{8,})/)
  return any ? any[1] : null
}

function isLinkedInSearchPage(input = '') {
  try {
    const url = new URL(input)
    return /(^|\.)linkedin\.com$/i.test(url.hostname) &&
      url.pathname.includes('/jobs/') &&
      !url.pathname.includes('/jobs/view/')
  } catch {
    return false
  }
}

function extractJobIdsFromHtml(html = '') {
  const ids = new Set()
  const add = (id) => {
    if (id && /^\d{8,}$/.test(id)) ids.add(id)
  }

  for (const m of html.matchAll(/jobPosting(?::|%3A)(\d{8,})/gi)) add(m[1])
  for (const m of html.matchAll(/\/jobs\/view\/(?:[^"'?#\s]*-)?(\d{8,})/gi)) add(m[1])
  for (const m of html.matchAll(/[?&]currentJobId=(\d{8,})/gi)) add(m[1])
  for (const m of html.matchAll(/data-(?:job-id|entity-id)=["']?(\d{8,})/gi)) add(m[1])

  return [...ids]
}

async function expandLinkedInSearchPage(input, limit) {
  const res = await fetch(input, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
  })
  if (!res.ok) throw new Error(`LinkedIn returned HTTP ${res.status} for search page`)

  const ids = extractJobIdsFromHtml(await res.text()).slice(0, limit)
  if (!ids.length) throw new Error('No public job IDs found on the LinkedIn search page')

  return ids.map((id) => ({ url: `https://www.linkedin.com/jobs/view/${id}` }))
}

// Resolve one queued/CLI URL into the list of job URLs to parse: a job URL maps
// to itself; a search page is expanded into its public job URLs (capped).
export async function resolveJobUrls(url, limit = 25) {
  if (!extractJobId(url) && isLinkedInSearchPage(url)) {
    const expanded = await expandLinkedInSearchPage(url, limit)
    return expanded.map((e) => e.url)
  }
  return [url]
}

async function expandInputUrls(inputs, limit) {
  const queue = []
  for (const input of inputs) {
    if (!extractJobId(input) && isLinkedInSearchPage(input)) {
      const remaining = Math.max(0, limit - queue.length)
      const expanded = await expandLinkedInSearchPage(input, remaining)
      console.log(`  Expanded search page to ${expanded.length} job URL(s).`)
      queue.push(...expanded)
    } else {
      queue.push({ url: input })
    }
    if (queue.length >= limit) break
  }
  return queue.slice(0, limit)
}

function text$($, sel) {
  const el = $(sel).first()
  return el.length ? el.text().replace(/\s+/g, ' ').trim() : ''
}

// Fetch + parse a single LinkedIn job. Throws on a bad URL or unreachable job.
export async function parseLinkedInJob(input) {
  const id = extractJobId(input)
  if (!id) throw new Error(`Could not find a job id in "${input}"`)

  const url = `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${id}`
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' } })
  if (res.status === 404) throw new Error(`Job ${id} not found or no longer public`)
  if (!res.ok) throw new Error(`LinkedIn returned HTTP ${res.status} for job ${id}`)

  const $ = cheerio.load(await res.text())

  const title = text$($, '[class*="top-card-layout__title"]')
  if (!title) throw new Error(`Job ${id}: page returned no parseable job content`)

  const company =
    text$($, '[class*="topcard__org-name-link"]') || text$($, '[class*="topcard__flavor"]')
  const location = text$($, '[class*="topcard__flavor--bullet"]')
  const posted = text$($, '[class*="posted-time-ago__text"]')
  const description = text$($, '[class*="show-more-less-html__markup"]')

  // Job criteria card: Seniority level / Employment type / Job function / Industries
  const criteria = {}
  $('[class*="job-criteria-item"]').each((_, el) => {
    const key = $(el).find('[class*="job-criteria-subheader"]').text().replace(/\s+/g, ' ').trim()
    const val = $(el).find('[class*="job-criteria-text"]').text().replace(/\s+/g, ' ').trim()
    if (key) criteria[key.toLowerCase()] = val
  })

  return {
    job_id: `linkedin-${id}`,
    title,
    company: company || 'Unknown',
    location,
    country: guessCountry(location),
    remote: remoteMode(location, criteria['workplace type'] || ''),
    employment_type: criteria['employment type'] || 'Full-time',
    department: criteria['job function'] || '',
    seniority: criteria['seniority level'] || '',
    salary: '',
    salary_min: null,
    salary_max: null,
    skills: [],
    description: description.slice(0, 4000),
    apply_url: `https://www.linkedin.com/jobs/view/${id}`,
    linkedin_url: `https://www.linkedin.com/jobs/view/${id}`,
    source: 'linkedin',
    posted_date: relativeToIso(posted),
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Process one queue row (a single job URL or a search page). Search pages are
// expanded into their public job URLs; each job is parsed and upserted into
// `jobs`, then the row is marked done/error. With no admin client, jobs are
// printed instead (standalone CLI use). Returns { ok, failed }.
export async function processQueueItem(admin, item, limit = 25) {
  let jobUrls
  try {
    jobUrls = await resolveJobUrls(item.url, limit)
    if (jobUrls.length !== 1 || jobUrls[0] !== item.url) {
      console.log(`  Expanded search → ${jobUrls.length} job URL(s): ${item.url}`)
    }
  } catch (err) {
    console.log(`  ✗ ${item.url}: ${err.message}`)
    if (admin && item.id != null) {
      await admin.from('linkedin_queue').update({
        status: 'error', error: err.message, processed_at: new Date().toISOString(),
      }).eq('id', item.id)
    }
    return { ok: 0, failed: 1 }
  }

  let lastJobId = null
  let ok = 0
  let failed = 0
  for (const jobUrl of jobUrls) {
    try {
      const job = await parseLinkedInJob(jobUrl)
      if (admin) {
        const { error: upErr } = await admin.from('jobs').upsert(job, { onConflict: 'job_id' })
        if (upErr) throw upErr
        lastJobId = job.job_id
      } else {
        console.log(JSON.stringify(job, null, 2))
      }
      console.log(`  ✓ ${job.title} @ ${job.company}`)
      ok++
    } catch (err) {
      failed++
      console.log(`  ✗ ${jobUrl}: ${err.message}`)
    }
    await sleep(1500) // be polite — low volume, spaced out
  }

  // Mark the row resolved once all its jobs have been attempted. Only a clean
  // zero-success run counts as an error.
  if (admin && item.id != null) {
    await admin.from('linkedin_queue').update({
      status: ok === 0 ? 'error' : 'done',
      job_id: lastJobId,
      error: failed ? `${failed} job(s) failed` : null,
      processed_at: new Date().toISOString(),
    }).eq('id', item.id)
  }
  return { ok, failed }
}

// Drain pending rows from linkedin_queue. Claims each row as 'processing' first
// so overlapping drainers don't double-process. Returns { processed, ok, failed }.
export async function drainLinkedInQueue(admin, { limit = 25, max = 50 } = {}) {
  const { data, error } = await admin
    .from('linkedin_queue')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(max)
  if (error) throw error
  const pending = data || []

  let ok = 0
  let failed = 0
  let processed = 0
  for (const item of pending) {
    // Atomically claim: only proceed if the row is still 'pending'. If another
    // drainer grabbed it first, the update matches no rows and we skip it.
    const { data: claimed, error: claimErr } = await admin
      .from('linkedin_queue')
      .update({ status: 'processing' })
      .eq('id', item.id)
      .eq('status', 'pending')
      .select('id')
    if (claimErr || !claimed?.length) continue

    processed++
    const r = await processQueueItem(admin, item, limit)
    ok += r.ok
    failed += r.failed
  }
  return { processed, ok, failed }
}

async function main() {
  const args = process.argv.slice(2)
  let limit = 25
  const urls = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit') {
      limit = Number(args[++i] || 25)
    } else if (!args[i].startsWith('--')) {
      urls.push(args[i])
    }
  }

  // Lazily load the admin client only if we'll write to Supabase.
  let admin = null
  if (HAS_SUPABASE) ({ admin } = await import('./supabaseAdmin.js'))

  // Source of work: explicit URLs, or the queue table.
  if (urls.length) {
    const queue = await expandInputUrls(urls, limit)
    if (!queue.length) { console.log('\nNothing to process.\n'); return }
    console.log(`\nProcessing ${queue.length} job(s)…\n`)
    let ok = 0
    let failed = 0
    for (const item of queue) {
      const r = await processQueueItem(admin, item, limit)
      ok += r.ok
      failed += r.failed
    }
    console.log(`\nDone. ${ok} parsed, ${failed} failed.${admin ? '' : ' (not saved — Supabase not configured)'}\n`)
  } else if (admin) {
    const { processed, ok, failed } = await drainLinkedInQueue(admin, { limit })
    if (!processed) { console.log('\nNothing to process.\n'); return }
    console.log(`\nDone. ${ok} parsed, ${failed} failed.\n`)
  } else {
    console.error('\n  Provide at least one LinkedIn job URL, e.g.\n' +
      '    npm run linkedin -- https://www.linkedin.com/jobs/view/4414360574\n')
    process.exit(1)
  }
}

// Run only when invoked directly (so the parser can also be imported).
const invokedDirectly = process.argv[1] && process.argv[1].endsWith('linkedin.js')
if (invokedDirectly) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
}
