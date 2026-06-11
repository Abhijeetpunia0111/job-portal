// Build a Naukri jobs *search* URL from human-friendly filters.
//
// Naukri's job DATA is locked behind a recaptcha-protected API, so we can't
// auto-scrape results (unlike LinkedIn's public guest pages). What we CAN do is
// construct the search URL Naukri itself uses, so the user opens a tailored
// search in their browser. Naukri encodes searches both as an SEO slug path
// (`product-designer-jobs-in-bengaluru`) and as `k`/`l` query params — we emit
// both, which is exactly what Naukri's own search links do.

export const EXPERIENCE = [
  { value: '', label: 'Any experience' },
  { value: '0', label: 'Fresher' },
  { value: '1', label: '1 year' },
  { value: '2', label: '2 years' },
  { value: '3', label: '3 years' },
  { value: '4', label: '4 years' },
  { value: '5', label: '5 years' },
  { value: '6', label: '6 years' },
  { value: '7', label: '7 years' },
  { value: '10', label: '10 years' },
  { value: '15', label: '15+ years' },
]

export const JOB_AGE = [
  { value: '', label: 'Any time' },
  { value: '1', label: 'Last 1 day' },
  { value: '3', label: 'Last 3 days' },
  { value: '7', label: 'Last week' },
  { value: '15', label: 'Last 15 days' },
  { value: '30', label: 'Last month' },
]

// "Product Designer" -> "product-designer" for the SEO slug.
function slugify(s = '') {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

// filters: { keywords, location, experience, jobAge, remote }
export function buildNaukriSearchUrl(filters = {}) {
  const { keywords = '', location = '', experience = '', jobAge = '', remote = false } = filters
  const kw = keywords.trim()
  const loc = location.trim()

  const kwSlug = slugify(kw)
  const locSlug = slugify(loc)
  let path = kwSlug ? `${kwSlug}-jobs` : 'jobs'
  if (locSlug) path += `-in-${locSlug}`

  const params = new URLSearchParams()
  if (kw) params.set('k', kw)
  if (loc) params.set('l', loc)
  if (experience !== '') params.set('experience', experience)
  if (jobAge) params.set('jobAge', jobAge)
  if (remote) params.set('wfhType', '2') // Naukri's work-from-home / remote filter

  const qs = params.toString()
  return `https://www.naukri.com/${path}${qs ? `?${qs}` : ''}`
}

// Trailing numeric id in a Naukri job-listings URL (used as a stable job_id).
export function extractNaukriJobId(url = '') {
  const m = String(url).match(/(\d{6,})(?:[/?#]|$)/)
  return m ? m[1] : null
}
