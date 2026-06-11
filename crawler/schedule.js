// Scheduler: re-crawl on a cron cadence. Keeps the jobs table fresh.
//   node crawler/schedule.js
//
// Frequencies map to cron expressions; every active company is crawled on the
// matching tick (a company's `frequency` column decides which bucket it's in).
import cron from 'node-cron'
import { admin } from './supabaseAdmin.js'
import { fetchCompanyJobs } from '../src/lib/connectors.js'
import { drainLinkedInQueue } from './linkedin.js'

const CRON = {
  hourly: '0 * * * *',        // top of every hour
  daily: '0 6 * * *',         // 06:00 every day
  weekly: '0 6 * * 1',        // 06:00 every Monday
}

async function crawlByFrequency(freq) {
  const { data: companies, error } = await admin
    .from('companies')
    .select('*')
    .eq('status', 'active')
    .eq('frequency', freq)
  if (error) return console.error('schedule:', error.message)
  if (!companies?.length) return

  console.log(`[${freq}] crawling ${companies.length} companies`)
  for (const c of companies) {
    try {
      const jobs = await fetchCompanyJobs(c)
      const rows = jobs.map((j) => ({ ...j, company_id: c.id }))
      for (let i = 0; i < rows.length; i += 500) {
        await admin.from('jobs').upsert(rows.slice(i, i + 500), { onConflict: 'job_id' })
      }
      console.log(`  ✓ ${c.name}: ${rows.length}`)
    } catch (err) {
      console.log(`  ✗ ${c.name}: ${err.message}`)
    }
  }
}

// Drain user-submitted LinkedIn URLs from the queue (shared with the API server
// and the manual `npm run linkedin` worker).
async function drainQueue() {
  try {
    const { processed, ok, failed } = await drainLinkedInQueue(admin, { limit: 25, max: 20 })
    if (processed) console.log(`[linkedin] processed ${processed} item(s): ${ok} ok, ${failed} failed`)
  } catch (err) {
    console.error('linkedin queue:', err.message)
  }
}

// Wipe the queue table once a day so it doesn't grow unbounded.
async function purgeQueue() {
  const { error } = await admin.from('linkedin_queue').delete().neq('id', 0)
  if (error) return console.error('linkedin purge:', error.message)
  console.log('[linkedin] queue table cleared (daily purge)')
}

for (const [freq, expr] of Object.entries(CRON)) {
  cron.schedule(expr, () => crawlByFrequency(freq))
  console.log(`scheduled "${freq}" -> ${expr}`)
}

// Check the LinkedIn queue every 2 minutes.
cron.schedule('*/2 * * * *', drainQueue)
console.log('scheduled "linkedin-queue" -> */2 * * * *')

// Empty the queue table every day at 03:00.
cron.schedule('0 3 * * *', purgeQueue)
console.log('scheduled "linkedin-purge" -> 0 3 * * *')

console.log('\nScheduler running. Press Ctrl+C to stop.\n')
