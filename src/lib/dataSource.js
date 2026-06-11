// Unified data access. Two modes:
//   - "supabase": read companies + jobs from Supabase (populated by the crawler)
//   - "live":     fetch jobs directly from ATS APIs in the browser, companies in localStorage
import { supabase, isSupabaseEnabled } from './supabase'
import { fetchAllJobs, fetchCompanyJobs } from './connectors'
import { SEED_COMPANIES } from '../data/seed'
import { load, save } from './storage'

export const MODE = isSupabaseEnabled ? 'supabase' : 'live'

// ---------------- companies ----------------

export async function loadCompanies() {
  if (MODE === 'supabase') {
    const { data, error } = await supabase.from('companies').select('*').order('name')
    if (error) throw error
    return data?.length ? data : SEED_COMPANIES
  }
  return load('companies', SEED_COMPANIES)
}

export async function addCompany(company) {
  if (MODE === 'supabase') {
    const { error } = await supabase.from('companies').upsert(company, { onConflict: 'id' })
    if (error) throw error
  } else {
    const list = load('companies', SEED_COMPANIES)
    save('companies', [company, ...list.filter((c) => c.id !== company.id)])
  }
  return company
}

export async function updateCompany(company) {
  if (MODE === 'supabase') {
    const { error } = await supabase.from('companies').upsert(company, { onConflict: 'id' })
    if (error) throw error
  } else {
    const list = load('companies', SEED_COMPANIES)
    // Replace in place to preserve list order.
    save('companies', list.map((c) => (c.id === company.id ? company : c)))
  }
  return company
}

export async function removeCompany(id) {
  if (MODE === 'supabase') {
    await supabase.from('jobs').delete().eq('company_id', id)
    await supabase.from('companies').delete().eq('id', id)
  } else {
    const list = load('companies', SEED_COMPANIES)
    save('companies', list.filter((c) => c.id !== id))
  }
}

// ---------------- jobs ----------------

export async function loadJobs(companies) {
  if (MODE === 'supabase') {
    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .order('posted_date', { ascending: false })
      .limit(5000)
    if (error) throw error
    return data || []
  }
  // live mode — fetch every company's board in parallel
  return fetchAllJobs(companies)
}

// ---------------- LinkedIn URL queue ----------------
// Users submit job URLs; the `npm run linkedin` worker parses them server-side
// (browser can't fetch LinkedIn directly). Requires Supabase to persist the queue.

export async function queueLinkedInUrls(urls) {
  if (MODE !== 'supabase') {
    throw new Error('Connect Supabase to queue URLs, or run: npm run linkedin -- <url>')
  }
  const rows = urls.map((url) => ({ url, status: 'pending' }))
  const { error } = await supabase.from('linkedin_queue').insert(rows)
  if (error) throw error
}

// Ask the server to process the queue right now (instead of waiting for its
// next auto-drain tick). Best-effort: if the server isn't running, we ignore it
// since the background drainer will pick the rows up anyway.
export async function triggerLinkedInDrain() {
  try {
    const res = await fetch('/api/linkedin/drain', { method: 'POST' })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function loadLinkedInQueue() {
  if (MODE !== 'supabase') return []
  const { data, error } = await supabase
    .from('linkedin_queue')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return data || []
}

// Delete jobs. In supabase mode this removes the rows from the DB; in live mode
// jobs aren't persisted (they're re-fetched each load), so there's nothing to
// delete server-side and the caller just clears local state.
export async function deleteAllJobs() {
  if (MODE !== 'supabase') return
  // .neq on the text PK matches every row (a delete needs an explicit filter).
  const { error } = await supabase.from('jobs').delete().neq('job_id', '')
  if (error) throw error
}

export async function deleteJobs(ids = []) {
  if (!ids.length || MODE !== 'supabase') return
  const { error } = await supabase.from('jobs').delete().in('job_id', ids)
  if (error) throw error
}

// Upsert a single job (used by the Naukri paste-import). Requires Supabase to
// persist — in live mode there's no job store.
export async function saveJob(job) {
  if (MODE !== 'supabase') {
    throw new Error('Connect Supabase to save imported jobs.')
  }
  const { error } = await supabase.from('jobs').upsert(job, { onConflict: 'job_id' })
  if (error) throw error
}

// Live fetch for a single company (used to show jobs instantly after Add / Re-crawl,
// in both modes). In supabase mode we also persist them.
export async function crawlCompany(company) {
  const jobs = await fetchCompanyJobs(company)
  if (MODE === 'supabase') {
    const rows = jobs.map((j) => ({ ...j, company_id: company.id }))
    if (rows.length) await supabase.from('jobs').upsert(rows, { onConflict: 'job_id' })
  }
  return jobs
}
