import { useMemo } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Card } from '../components/ui'
import { ATS_SOURCES } from '../lib/ats'

export default function Sources({ jobs, companies }) {
  const stats = useMemo(() => {
    const out = {}
    for (const key of Object.keys(ATS_SOURCES)) out[key] = { jobs: 0, companies: 0 }
    for (const j of jobs) if (out[j.source]) out[j.source].jobs++
    for (const c of companies) if (out[c.ats]) out[c.ats].companies++
    return out
  }, [jobs, companies])

  return (
    <div className="mx-auto max-w-7xl px-8 py-7">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-white">Sources &amp; Connectors</h1>
        <p className="mt-1 text-sm text-slate-400">
          Each connector pulls structured job data and normalizes it into the unified schema.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Object.entries(ATS_SOURCES).map(([key, s]) => (
          <Card key={key} className="p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-lg text-sm font-bold"
                      style={{ backgroundColor: s.color + '1f', color: s.color }}>
                  {s.label[0]}
                </span>
                <div>
                  <div className="font-semibold text-white">{s.label}</div>
                  <div className="text-xs text-slate-500">Connector</div>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                <CheckCircle2 size={13} /> Ready
              </span>
            </div>
            <p className="mt-3 text-sm text-slate-400">{s.note}</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-ink-900/60 px-3 py-2">
                <div className="text-lg font-semibold text-white">{stats[key].companies}</div>
                <div className="text-xs text-slate-500">Companies</div>
              </div>
              <div className="rounded-lg bg-ink-900/60 px-3 py-2">
                <div className="text-lg font-semibold text-white">{stats[key].jobs}</div>
                <div className="text-xs text-slate-500">Jobs</div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="mt-6 p-5">
        <h2 className="mb-3 text-sm font-semibold text-white">Unified Job Schema</h2>
        <p className="mb-3 text-sm text-slate-400">
          Every connector normalizes its output to this shape before it lands in the jobs database.
        </p>
        <pre className="overflow-x-auto rounded-lg bg-ink-900 p-4 text-xs leading-relaxed text-slate-300">
{`{
  "job_id":         "c1-0001",
  "title":          "Senior Frontend Developer",
  "company":        "OpenAI",
  "location":       "San Francisco, CA",
  "remote":         "Hybrid",
  "employment_type":"Full-time",
  "department":     "Engineering",
  "seniority":      "Senior",
  "salary":         "$140k – $190k",
  "skills":         ["React", "TypeScript", "Node.js"],
  "description":    "...",
  "apply_url":      "https://...",
  "linkedin_url":   "https://www.linkedin.com/jobs/view/...",
  "source":         "greenhouse",
  "posted_date":    "2026-05-21"
}`}
        </pre>
      </Card>
    </div>
  )
}
