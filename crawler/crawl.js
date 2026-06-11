// One-shot crawler: fetch live jobs for every active company and upsert to Supabase.
//   node crawler/crawl.js            -> crawl all active companies
//   node crawler/crawl.js stripe     -> crawl only company id "stripe"
import { admin } from './supabaseAdmin.js'
import { fetchCompanyJobs, SUPPORTED_ATS } from '../src/lib/connectors.js'
import { autoFetch } from './autoConnector.js'
import { SEED_COMPANIES } from '../src/data/seed.js'

async function getCompanies(onlyId) {
  // Seed the companies table on first run.
  const { data: existing } = await admin.from('companies').select('id')
  if (!existing || existing.length === 0) {
    console.log('Seeding companies table…')
    await admin.from('companies').upsert(SEED_COMPANIES, { onConflict: 'id' })
  }
  let q = admin.from('companies').select('*')
  if (onlyId) q = q.eq('id', onlyId)
  const { data, error } = await q
  if (error) throw error
  return (data || []).filter((c) => onlyId || c.status === 'active')
}

async function crawlOne(company) {
  try {
    // Known ATS → built-in connector; anything else → self-adapting discovery.
    const jobs = SUPPORTED_ATS.has(company.ats)
      ? await fetchCompanyJobs(company)
      : await autoFetch(company)
    const rows = jobs.map((j) => ({ ...j, company_id: company.id }))
    if (rows.length) {
      // Upsert in chunks to stay well under request-size limits.
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500)
        const { error } = await admin.from('jobs').upsert(chunk, { onConflict: 'job_id' })
        if (error) throw error
      }
    }
    console.log(`  ✓ ${company.name.padEnd(16)} ${rows.length} jobs`)
    return rows.length
  } catch (err) {
    console.log(`  ✗ ${company.name.padEnd(16)} ${err.message}`)
    return 0
  }
}

export async function crawl(onlyId) {
  const companies = await getCompanies(onlyId)
  console.log(`\nCrawling ${companies.length} compan${companies.length === 1 ? 'y' : 'ies'}…`)
  let total = 0
  // Sequential to be polite to the public APIs.
  for (const c of companies) total += await crawlOne(c)
  console.log(`\nDone. ${total} jobs upserted.\n`)
  return total
}

// Run when invoked directly.
const invokedDirectly = process.argv[1] && process.argv[1].endsWith('crawl.js')
if (invokedDirectly) {
  crawl(process.argv[2]).then(() => process.exit(0)).catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
