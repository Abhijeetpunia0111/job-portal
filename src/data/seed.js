// Default companies with VERIFIED live public job boards.
// `slug` is the board identifier the connector uses to hit the real ATS API.
// (Case matters for Ashby/SmartRecruiters slugs.)
export const SEED_COMPANIES = [
  { id: 'anthropic',  name: 'Anthropic',   url: 'boards.greenhouse.io/anthropic',     ats: 'greenhouse',      slug: 'anthropic',  industry: 'AI',          country: 'USA', status: 'active', frequency: 'daily' },
  { id: 'stripe',     name: 'Stripe',      url: 'boards.greenhouse.io/stripe',        ats: 'greenhouse',      slug: 'stripe',     industry: 'Fintech',     country: 'USA', status: 'active', frequency: 'daily' },
  { id: 'databricks', name: 'Databricks',  url: 'boards.greenhouse.io/databricks',    ats: 'greenhouse',      slug: 'databricks', industry: 'Data & AI',   country: 'USA', status: 'active', frequency: 'daily' },
  { id: 'ramp',       name: 'Ramp',        url: 'jobs.ashbyhq.com/ramp',              ats: 'ashby',           slug: 'ramp',       industry: 'Fintech',     country: 'USA', status: 'active', frequency: 'daily' },
  { id: 'linear',     name: 'Linear',      url: 'jobs.ashbyhq.com/Linear',            ats: 'ashby',           slug: 'Linear',     industry: 'Productivity',country: 'USA', status: 'active', frequency: 'daily' },
  { id: 'visa',       name: 'Visa',        url: 'careers.smartrecruiters.com/Visa',   ats: 'smartrecruiters', slug: 'Visa',       industry: 'Payments',    country: 'USA', status: 'active', frequency: 'weekly' },
  { id: 'equinox',    name: 'Equinox',     url: 'careers.smartrecruiters.com/Equinox',ats: 'smartrecruiters', slug: 'Equinox',    industry: 'Fitness',     country: 'USA', status: 'active', frequency: 'weekly' },
  { id: 'quickplay',  name: 'Quickplay',   url: 'firstlightai.bamboohr.com',          ats: 'bamboohr',        slug: 'firstlightai',industry: 'Media & Streaming', country: 'Canada', status: 'active', frequency: 'daily' },
]
