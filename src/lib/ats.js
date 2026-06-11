// ATS detection + normalization helpers.
// Mirrors the "Company Discovery" feature: given a career URL, infer the
// underlying Applicant Tracking System and its structured-feed pattern.

export const ATS_SOURCES = {
  greenhouse: {
    label: 'Greenhouse',
    color: '#22c55e',
    match: /greenhouse\.io/i,
    feed: (slug) => `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`,
    note: 'Exposes a structured JSON jobs endpoint.',
  },
  lever: {
    label: 'Lever',
    color: '#6366f1',
    match: /lever\.co/i,
    feed: (slug) => `https://api.lever.co/v0/postings/${slug}?mode=json`,
    note: 'Provides structured JSON job feeds.',
  },
  workday: {
    label: 'Workday',
    color: '#f59e0b',
    match: /myworkdayjobs\.com|workday/i,
    feed: () => 'Custom extraction (CXS endpoint per tenant)',
    note: 'Enterprise scale — requires custom extraction logic.',
  },
  smartrecruiters: {
    label: 'SmartRecruiters',
    color: '#06b6d4',
    match: /smartrecruiters\.com/i,
    feed: (slug) => `https://api.smartrecruiters.com/v1/companies/${slug}/postings`,
    note: 'Public postings API available.',
  },
  ashby: {
    label: 'Ashby',
    color: '#ec4899',
    match: /ashbyhq\.com/i,
    feed: (slug) => `https://api.ashbyhq.com/posting-api/job-board/${slug}`,
    note: 'Growing fast among startups; JSON job board API.',
  },
  bamboohr: {
    label: 'BambooHR',
    color: '#84cc16',
    match: /bamboohr\.com/i,
    feed: (slug) => `https://${slug}.bamboohr.com/careers/list`,
    note: 'Public careers JSON feed (list + per-job detail).',
  },
  company: {
    label: 'Company Site',
    color: '#94a3b8',
    match: /.*/i,
    feed: () => 'HTML crawl (Playwright + Cheerio)',
    note: 'Generic career site — crawled and parsed to the unified schema.',
  },
  linkedin: {
    label: 'LinkedIn',
    color: '#0a66c2',
    match: /linkedin\.com/i,
    feed: () => 'User-provided job URL (public guest page)',
    note: 'Parsed from user-submitted public job URLs (authorized, low-volume).',
  },
}

export function detectAts(url = '') {
  for (const key of ['greenhouse', 'lever', 'workday', 'smartrecruiters', 'ashby', 'bamboohr']) {
    if (ATS_SOURCES[key].match.test(url)) return key
  }
  return 'company'
}

// Best-effort slug extraction from common ATS URL shapes.
export function extractSlug(url = '') {
  try {
    const u = new URL(url.startsWith('http') ? url : 'https://' + url)
    const parts = u.pathname.split('/').filter(Boolean)
    return parts[parts.length - 1] || u.hostname.split('.')[0]
  } catch {
    return url.replace(/^https?:\/\//, '').split('/').pop() || 'company'
  }
}

export function feedFor(url) {
  const key = detectAts(url)
  return ATS_SOURCES[key].feed(extractSlug(url))
}
