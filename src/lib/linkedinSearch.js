// Build a LinkedIn jobs *search* URL from human-friendly filters.
//
// The crawler (crawler/linkedin.js) already knows how to take a LinkedIn jobs
// search page, scrape the public job IDs off it, and parse each one. This helper
// just constructs that search URL from filter inputs (job role, location, etc.)
// using LinkedIn's documented public query params, so users don't have to hand-
// craft `f_TPR=r604800`-style URLs.

// LinkedIn's public filter codes. Values map straight to the `f_*` query params.
export const DATE_POSTED = [
  { value: '', label: 'Any time' },
  { value: 'r86400', label: 'Past 24 hours' },
  { value: 'r604800', label: 'Past week' },
  { value: 'r2592000', label: 'Past month' },
]

export const EXPERIENCE = [
  { value: '1', label: 'Internship' },
  { value: '2', label: 'Entry level' },
  { value: '3', label: 'Associate' },
  { value: '4', label: 'Mid-Senior level' },
  { value: '5', label: 'Director' },
  { value: '6', label: 'Executive' },
]

export const JOB_TYPE = [
  { value: 'F', label: 'Full-time' },
  { value: 'P', label: 'Part-time' },
  { value: 'C', label: 'Contract' },
  { value: 'T', label: 'Temporary' },
  { value: 'I', label: 'Internship' },
  { value: 'V', label: 'Volunteer' },
]

export const WORKPLACE = [
  { value: '1', label: 'On-site' },
  { value: '2', label: 'Remote' },
  { value: '3', label: 'Hybrid' },
]

export const SORT_BY = [
  { value: '', label: 'Most relevant' },
  { value: 'DD', label: 'Most recent' },
]

// Build LinkedIn people-search URLs to find relevant humans to reach out to for
// a given job. ToS-safe: these are just public search links the user clicks —
// no scraping. We can't resolve actual profiles without login, so we surface the
// most useful keyword searches (recruiters, the hiring team, peers in the role).
export function peopleSearchUrls(job = {}) {
  const company = (job.company || '').trim()
  const role = (job.title || '').trim()
  const dept = (job.department || '').trim()
  const people = (kw) =>
    `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(kw)}`

  const targets = []
  if (company) {
    targets.push({ label: `Recruiters at ${company}`, kw: `${company} recruiter`, hint: 'Talent / hiring contacts' })
    targets.push({ label: `Talent acquisition at ${company}`, kw: `${company} talent acquisition`, hint: 'TA team' })
    if (role) targets.push({ label: `Hiring managers for this role`, kw: `${company} ${role} hiring manager`, hint: 'Likely decision-maker' })
    if (role || dept) targets.push({ label: `People in the team`, kw: `${company} ${role || dept}`, hint: 'Potential peers / referrers' })
  }
  return targets.map((t) => ({ label: t.label, hint: t.hint, url: people(t.kw) }))
}

// The company's LinkedIn page (best-effort search by name).
export function companyLinkedInUrl(company = '') {
  return `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(company)}`
}

// filters: { keywords, location, datePosted, experience[], jobType[], workplace[], sortBy }
// Array filters (experience/jobType/workplace) become comma-joined codes, which
// is exactly how LinkedIn encodes multi-select filters.
export function buildLinkedInSearchUrl(filters = {}) {
  const {
    keywords = '',
    location = '',
    datePosted = '',
    experience = [],
    jobType = [],
    workplace = [],
    sortBy = '',
  } = filters

  const params = new URLSearchParams()
  if (keywords.trim()) params.set('keywords', keywords.trim())
  if (location.trim()) params.set('location', location.trim())
  if (datePosted) params.set('f_TPR', datePosted)
  if (experience.length) params.set('f_E', experience.join(','))
  if (jobType.length) params.set('f_JT', jobType.join(','))
  if (workplace.length) params.set('f_WT', workplace.join(','))
  if (sortBy) params.set('sortBy', sortBy)

  return `https://www.linkedin.com/jobs/search/?${params.toString()}`
}
