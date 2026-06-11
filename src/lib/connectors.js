// Real ATS connectors. This module is shared by BOTH the browser (live mode)
// and the Node crawler — it only uses the global `fetch` (Node 18+ / all browsers).
//
// Each connector fetches a company's public job feed and normalizes it to the
// unified schema. No authentication required — these are public job boards.

// Greenhouse blocks browser CORS, so in the Vite dev server we proxy it via
// /ats/gh (see vite.config.js). In Node (crawler) we hit the API directly.
const IS_BROWSER = typeof window !== 'undefined'
const IS_DEV = IS_BROWSER && typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV
const GH_BASE = IS_DEV ? '/ats/gh' : 'https://boards-api.greenhouse.io'

// ---------- shared helpers ----------

export function stripHtml(html = '') {
  return String(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isoDate(value) {
  if (!value) return ''
  const d = typeof value === 'number' ? new Date(value) : new Date(value)
  return isNaN(d) ? '' : d.toISOString().slice(0, 10)
}

const SKILL_DICT = [
  'React', 'TypeScript', 'JavaScript', 'Node.js', 'Python', 'Go', 'Golang', 'Java', 'Ruby', 'Rust',
  'C++', 'Kotlin', 'Swift', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'GraphQL', 'AWS', 'GCP',
  'Azure', 'Kubernetes', 'Docker', 'Terraform', 'Spark', 'Airflow', 'dbt', 'Snowflake', 'Kafka',
  'Figma', 'PyTorch', 'TensorFlow', 'LLM', 'SQL', 'Next.js', 'Tailwind',
]

function extractSkills(text = '') {
  const found = []
  for (const s of SKILL_DICT) {
    const re = new RegExp(`(^|[^a-zA-Z])${s.replace(/[+.]/g, '\\$&')}([^a-zA-Z]|$)`, 'i')
    if (re.test(text)) found.push(s === 'Golang' ? 'Go' : s)
    if (found.length >= 6) break
  }
  return [...new Set(found)]
}

function guessSeniority(title = '') {
  const t = title.toLowerCase()
  if (/\bintern|internship\b/.test(t)) return 'Intern'
  if (/\bjunior|jr\.?\b|associate|entry|graduate\b/.test(t)) return 'Junior'
  if (/\bprincipal|staff\b/.test(t)) return 'Staff'
  if (/\b(director|vp|head of|chief|cto|ceo)\b/.test(t)) return 'Lead'
  if (/\b(lead|manager|mgr)\b/.test(t)) return 'Lead'
  if (/\bsenior|sr\.?\b/.test(t)) return 'Senior'
  return 'Mid'
}

function guessCountry(location = '') {
  const l = location.toLowerCase()
  if (/india|bengaluru|bangalore|mumbai|delhi|hyderabad|pune|gurgaon/.test(l)) return 'India'
  if (/germany|berlin|munich|münchen|hamburg|frankfurt/.test(l)) return 'Germany'
  if (/united kingdom|\buk\b|london|manchester|england/.test(l)) return 'UK'
  if (/canada|toronto|vancouver|montreal|ontario/.test(l)) return 'Canada'
  if (/ireland|dublin/.test(l)) return 'Ireland'
  if (/france|paris/.test(l)) return 'France'
  if (/singapore/.test(l)) return 'Singapore'
  if (/australia|sydney|melbourne/.test(l)) return 'Australia'
  if (/united states|usa|, [a-z]{2}\b|remote — us|new york|san francisco|seattle|austin|boston|chicago|denver/.test(l)) return 'USA'
  if (/remote/.test(l)) return 'Remote'
  return 'Other'
}

function remoteMode(raw, location = '') {
  const v = String(raw || '').toLowerCase()
  if (v.includes('remote')) return 'Remote'
  if (v.includes('hybrid')) return 'Hybrid'
  if (v.includes('onsite') || v.includes('on-site') || v.includes('on_site')) return 'On-site'
  if (/remote/i.test(location)) return 'Remote'
  return 'On-site'
}

export function finalize(job, company) {
  const text = `${job.title} ${job.description || ''}`
  return {
    company: company.name,
    employment_type: 'Full-time',
    salary: '',
    salary_min: null,
    salary_max: null,
    description: '',
    linkedin_url: `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(job.title + ' ' + company.name)}`,
    ...job,
    seniority: job.seniority || guessSeniority(job.title),
    country: job.country || guessCountry(job.location || ''),
    skills: job.skills && job.skills.length ? job.skills : extractSkills(text),
  }
}

// ---------- per-ATS connectors ----------

async function greenhouse(company) {
  const url = `${GH_BASE}/v1/boards/${company.slug}/jobs?content=true`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Greenhouse ${company.slug}: ${res.status}`)
  const data = await res.json()
  return (data.jobs || []).map((j) =>
    finalize({
      job_id: `gh-${company.slug}-${j.id}`,
      title: j.title,
      location: j.location?.name || '',
      remote: remoteMode('', j.location?.name),
      department: j.departments?.[0]?.name || '',
      apply_url: j.absolute_url,
      posted_date: isoDate(j.updated_at || j.first_published),
      description: stripHtml(j.content),
      source: 'greenhouse',
    }, company)
  )
}

async function ashby(company) {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${company.slug}?includeCompensation=true`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Ashby ${company.slug}: ${res.status}`)
  const data = await res.json()
  return (data.jobs || []).map((j) => {
    const comp = j.compensation?.compensationTierSummary
    return finalize({
      job_id: `ashby-${company.slug}-${j.id}`,
      title: j.title,
      location: j.location || '',
      remote: j.isRemote ? 'Remote' : remoteMode(j.workplaceType, j.location),
      employment_type: j.employmentType || 'Full-time',
      department: j.department || j.team || '',
      apply_url: j.applyUrl || j.jobUrl,
      posted_date: isoDate(j.publishedAt),
      description: (j.descriptionPlain || '').slice(0, 800),
      salary: comp || '',
      source: 'ashby',
    }, company)
  })
}

async function lever(company) {
  const url = `https://api.lever.co/v0/postings/${company.slug}?mode=json`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Lever ${company.slug}: ${res.status}`)
  const data = await res.json()
  return (Array.isArray(data) ? data : []).map((j) =>
    finalize({
      job_id: `lever-${company.slug}-${j.id}`,
      title: j.text,
      location: j.categories?.location || '',
      remote: remoteMode(j.workplaceType, j.categories?.location),
      employment_type: j.categories?.commitment || 'Full-time',
      department: j.categories?.department || j.categories?.team || '',
      apply_url: j.applyUrl || j.hostedUrl,
      posted_date: isoDate(j.createdAt),
      description: stripHtml(j.descriptionPlain || j.description).slice(0, 800),
      source: 'lever',
    }, company)
  )
}

async function smartrecruiters(company) {
  const url = `https://api.smartrecruiters.com/v1/companies/${company.slug}/postings?limit=100`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`SmartRecruiters ${company.slug}: ${res.status}`)
  const data = await res.json()
  return (data.content || []).map((p) => {
    const loc = [p.location?.city, p.location?.region, p.location?.country]
      .filter(Boolean)
      .join(', ')
    return finalize({
      job_id: `sr-${company.slug}-${p.id}`,
      title: p.name,
      location: loc,
      remote: p.location?.remote ? 'Remote' : 'On-site',
      employment_type: p.typeOfEmployment?.label || 'Full-time',
      department: p.department?.label || p.function?.label || '',
      apply_url: `https://jobs.smartrecruiters.com/${company.slug}/${p.id}`,
      posted_date: isoDate(p.releasedDate),
      source: 'smartrecruiters',
    }, company)
  })
}

async function bamboohr(company) {
  const base = `https://${company.slug}.bamboohr.com`
  const res = await fetch(`${base}/careers/list`, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`BambooHR ${company.slug}: ${res.status}`)
  const data = await res.json()
  const list = data.result || []
  return Promise.all(
    list.map(async (j) => {
      let description = ''
      let posted = ''
      let department = j.departmentLabel || ''
      let employment = j.employmentStatusLabel || 'Full-time'
      // Detail call enriches description + posted date (list endpoint omits them).
      try {
        const dRes = await fetch(`${base}/careers/${j.id}/detail`, { headers: { Accept: 'application/json' } })
        if (dRes.ok) {
          const o = (await dRes.json())?.result?.jobOpening || {}
          description = stripHtml(o.description || '').slice(0, 1500)
          posted = isoDate(o.datePosted)
          department = o.departmentLabel || department
          employment = o.employmentStatusLabel || employment
        }
      } catch { /* fall back to list-level fields */ }
      const loc = [j.location?.city, j.location?.state].filter(Boolean).join(', ')
      return finalize({
        job_id: `bamboo-${company.slug}-${j.id}`,
        title: j.jobOpeningName,
        location: loc,
        remote: j.isRemote ? 'Remote' : remoteMode(String(j.locationType || ''), loc),
        employment_type: employment,
        department,
        apply_url: `${base}/careers/${j.id}`,
        posted_date: posted,
        description,
        source: 'bamboohr',
      }, company)
    })
  )
}

const CONNECTORS = { greenhouse, ashby, lever, smartrecruiters, bamboohr }

// ATS keys with a hand-written connector. Anything else → auto-discovery (crawler only).
export const SUPPORTED_ATS = new Set(Object.keys(CONNECTORS))

// Fetch + normalize a single company's jobs. Throws on network/HTTP error.
export async function fetchCompanyJobs(company) {
  const fn = CONNECTORS[company.ats]
  if (!fn) throw new Error(`No connector for ATS "${company.ats}"`)
  return fn(company)
}

// Fetch many companies in parallel; never rejects — returns per-company result.
export async function fetchAllJobs(companies, onProgress) {
  const results = await Promise.all(
    companies.map(async (c) => {
      try {
        const jobs = await fetchCompanyJobs(c)
        onProgress?.({ company: c.name, ok: true, count: jobs.length })
        return jobs
      } catch (err) {
        onProgress?.({ company: c.name, ok: false, error: err.message })
        return []
      }
    })
  )
  return results.flat()
}
