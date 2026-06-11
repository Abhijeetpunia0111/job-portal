# JobIntel — Company-First Job Intelligence

Aggregates **real, live jobs** from public ATS job boards (Greenhouse, Lever, Ashby,
SmartRecruiters), normalizes them into a unified schema, and serves a React + Tailwind
dashboard with search, filtering, and CSV export.

No LinkedIn scraping — data comes from companies' own public career feeds.

## Two ways to run

| Mode | When | Data source |
|------|------|-------------|
| **Live** (default) | No setup needed | Jobs fetched directly from ATS APIs in the browser |
| **Supabase** | Production / persistence | Node crawler pulls jobs → Supabase → dashboard reads from DB |

### Live mode (zero config)

```bash
npm install
npm run dev          # http://localhost:5173
```

The dashboard fetches live jobs from the seed companies on load. Greenhouse blocks
browser CORS, so the Vite dev server proxies it via `/ats/gh` (see `vite.config.js`);
Ashby and SmartRecruiters are called directly (they allow CORS).

> Live mode's Greenhouse fetch relies on the dev proxy, so it works under `npm run dev`.
> For a deployed build, use Supabase mode.

### Supabase mode (real backend + scheduler)

1. Create a project at [supabase.com](https://supabase.com).
2. In the **SQL Editor**, run [`supabase/schema.sql`](supabase/schema.sql).
3. Copy `.env.example` → `.env` and fill in:
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (frontend reads)
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (crawler writes — keep secret)
4. Crawl real jobs into the DB, then run the app:

```bash
npm run crawl              # fetch all active companies -> Supabase
npm run crawl stripe       # crawl one company by id
npm run crawl:schedule     # cron: hourly/daily/weekly per company.frequency
npm run enrich             # AI-enrich un-enriched jobs (needs ANTHROPIC_API_KEY)
npm run dev                # dashboard now reads from Supabase
```

The mode is detected automatically: if `VITE_SUPABASE_URL` is set, the app uses
Supabase; otherwise it runs in live mode. A banner at the top shows which is active.

## Architecture

```
Admin Dashboard (React + Tailwind)
        │  add company / search / filter / CSV
        ▼
Data Source layer  ──►  Supabase (Postgres)  ◄── Crawler (node-cron scheduler)
        │  (live fallback)                              │
        └──────────────► Connectors ◄──────────────────┘
                  Greenhouse · Lever · Ashby · SmartRecruiters
                              │
                   Job Normalization → Unified Schema
```

- [`src/lib/connectors.js`](src/lib/connectors.js) — real ATS fetch + normalize (shared by browser **and** crawler)
- [`src/lib/dataSource.js`](src/lib/dataSource.js) — switches between Supabase and live mode
- [`crawler/crawl.js`](crawler/crawl.js) — one-shot crawl → upsert to Supabase
- [`crawler/schedule.js`](crawler/schedule.js) — node-cron scheduler
- [`supabase/schema.sql`](supabase/schema.sql) — tables, indexes, RLS

## AI enrichment

`npm run enrich` runs each job description through an LLM and extracts structured
fields into the jobs table: `required_skills`, `tech_stack`, `experience_min/max`,
`ai_seniority`, `job_category`, and a one-line `ai_summary`. It uses **structured
outputs** (a JSON schema) so every response is valid JSON.

- **Provider is auto-selected by key** (server-side only — never shipped to the browser):
  - `OPENAI_API_KEY` → OpenAI (default `gpt-4o-mini`, override with `OPENAI_MODEL`)
  - `ANTHROPIC_API_KEY` → Anthropic (default `claude-opus-4-8`, override with `ANTHROPIC_MODEL`)
  - Force one with `ENRICH_PROVIDER=openai|anthropic` if both keys are set.
- Runs only over jobs not yet enriched; `npm run enrich -- --all` re-does everything.
- The dashboard automatically shows a **category** filter and the extracted tech
  stack once jobs are enriched, and includes the new columns in CSV export.

If your `jobs` table predates enrichment, run [`supabase/enrichment.sql`](supabase/enrichment.sql)
to add the columns (fresh `schema.sql` already includes them).

## Auto-discovery (self-adapting connector)

For companies with **no built-in connector**, the crawler tries to learn the site
on its own ([crawler/autoConnector.js](crawler/autoConnector.js)):

1. **Cached adapter?** → run it (no LLM cost).
2. Otherwise **learn**, in order: JSON-LD `JobPosting` (deterministic) → embedded
   `<script type=application/json>` job data (LLM maps once) → a discoverable JSON
   jobs API referenced by the page (LLM maps once).
3. The learned **adapter spec** (API URL + field paths, or "use JSON-LD") is cached
   per domain in the `adapters` table (or `crawler/.adapters.json`) and reused for
   free. It re-learns only if extraction returns 0.

`npm run crawl` routes any company whose `ats` isn't a built-in connector through this.
Needs `OPENAI_API_KEY` for the embedded/API paths (JSON-LD works without it).

**Limit:** no headless browser, so fully JS-rendered SPAs that expose nothing to a
plain fetch (e.g. Microsoft/Eightfold, many Workday tenants) won't yield jobs here —
they'd need a Playwright layer. Static sites and anything that ships JSON-LD / a JSON
feed work automatically. If your DB predates this, run [`supabase/adapters.sql`](supabase/adapters.sql).

## Resume Match

The **Resume Match** page scores a résumé against a job and suggests concrete edits.
Because the OpenAI key must stay server-side, matching runs through a tiny local API
([server/index.js](server/index.js)) that the dashboard calls at `/api/match` (Vite
proxies it in dev).

```bash
npm run server     # starts the match API on http://localhost:8787
npm run dev        # dashboard → Resume Match
```

- Paste résumé text or upload a **.pdf** / **.txt** (PDFs are parsed server-side via `pdf-parse`).
- Pick a job from the list (uses its title + description + enriched skills) or paste a custom JD.
- Returns: a **match %**, matched vs. missing skills, strengths, gaps, and numbered résumé suggestions — as validated structured output (`gpt-4o-mini` by default; set `OPENAI_MODEL`).

Needs `OPENAI_API_KEY` in `.env`. (For production, deploy this endpoint behind your app rather than running it locally.)

## Importing from LinkedIn (user-provided URLs)

LinkedIn import is user-initiated: you supply one or more job listing URLs you're
authorized to view, and the parser reads each job's **public guest page** (the page
LinkedIn serves to logged-out visitors) and normalizes it into the unified schema.
For a public jobs search page, it can expand the job IDs visible in that page's
markup, capped by `--limit`. No login, no proxies, no bot-detection evasion — keep
it low-volume and within LinkedIn's Terms.

**From the dashboard** (Supabase mode): **Import from LinkedIn** → paste URLs (one
per line) → they're queued in `linkedin_queue`. The scheduler drains the queue
every 2 minutes, or run it on demand:

```bash
npm run linkedin                                   # drain the queue (Supabase)
npm run linkedin -- https://www.linkedin.com/jobs/view/4414360574   # parse a URL now
npm run linkedin -- 4414360574                     # bare job id also works
npm run linkedin -- "https://in.linkedin.com/jobs/product-designer-jobs-chennai?position=1&pageNum=0" --limit 10
```

Without Supabase configured, `npm run linkedin -- <url>` parses the URL and prints
the normalized JSON (nothing is saved). Accepted URL shapes: `/jobs/view/<id>`,
`/jobs/view/<title-slug>-<id>`, `?currentJobId=<id>`, a bare numeric id, or a
public LinkedIn jobs search page. Search pages are expanded to the public job IDs
present in that page's markup and capped by `--limit`.

If your DB predates this, run [`supabase/linkedin.sql`](supabase/linkedin.sql) to add the queue table.

## Adding a company

Use **Companies → Add Company**. Paste the career URL (e.g.
`boards.greenhouse.io/figma`); the ATS type and board slug are auto-detected, then the
board is crawled live. Verified seed boards: Anthropic, Stripe, Databricks (Greenhouse),
Ramp, Linear (Ashby), Visa, Equinox (SmartRecruiters).

## Unified job schema

`job_id, title, company, location, country, remote, employment_type, department,
seniority, salary, salary_min, salary_max, skills[], description, apply_url,
linkedin_url, source, posted_date`

## Tech

React 18 · Vite 6 · Tailwind v4 · lucide-react · Supabase · node-cron · @anthropic-ai/sdk (Claude enrichment)

## Notes

- The seed RLS policies allow anonymous read/write so the dashboard works without auth
  (internal/demo use). For production, replace the `public write` policies with
  authenticated checks.
- `salary` is only populated where the ATS exposes it (e.g. some Ashby boards); most
  public feeds omit compensation.
