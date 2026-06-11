import { useMemo } from 'react'
import { Briefcase, Building2, Globe, Network, ArrowUpRight } from 'lucide-react'
import { Card, SourceBadge, Pill } from '../components/ui'
import { ATS_SOURCES } from '../lib/ats'

function Stat({ icon: Icon, label, value, accent }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-400">{label}</span>
        <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ backgroundColor: accent + '1f', color: accent }}>
          <Icon size={16} />
        </span>
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight text-white">{value}</div>
    </Card>
  )
}

function Bar({ label, value, max, color }) {
  const pct = max ? Math.round((value / max) * 100) : 0
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-slate-300">{label}</span>
        <span className="text-slate-500">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-ink-700/50">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

export default function Dashboard({ jobs, companies, setPage }) {
  const stats = useMemo(() => {
    const remote = jobs.filter((j) => j.remote === 'Remote').length
    const bySource = {}
    const byDept = {}
    const byCountry = {}
    for (const j of jobs) {
      bySource[j.source] = (bySource[j.source] || 0) + 1
      byDept[j.department] = (byDept[j.department] || 0) + 1
      byCountry[j.country] = (byCountry[j.country] || 0) + 1
    }
    return { remote, bySource, byDept, byCountry, sources: Object.keys(bySource).length }
  }, [jobs])

  const recent = useMemo(
    () => [...jobs].sort((a, b) => (a.posted_date < b.posted_date ? 1 : -1)).slice(0, 8),
    [jobs]
  )

  const deptMax = Math.max(1, ...Object.values(stats.byDept))
  const countryMax = Math.max(1, ...Object.values(stats.byCountry))

  return (
    <div className="mx-auto max-w-7xl px-8 py-7">
      <header className="mb-7">
        <h1 className="text-2xl font-semibold tracking-tight text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-400">
          Unified view across {companies.length} company career portals and {stats.sources} ATS sources.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat icon={Briefcase} label="Total Jobs" value={jobs.length} accent="#6366f1" />
        <Stat icon={Building2} label="Companies" value={companies.length} accent="#22c55e" />
        <Stat icon={Network} label="ATS Sources" value={stats.sources} accent="#f59e0b" />
        <Stat icon={Globe} label="Remote Jobs" value={stats.remote} accent="#06b6d4" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold text-white">Jobs by Source</h2>
          <div className="space-y-3.5">
            {Object.entries(stats.bySource)
              .sort((a, b) => b[1] - a[1])
              .map(([src, n]) => (
                <Bar key={src} label={ATS_SOURCES[src]?.label || src} value={n} max={jobs.length} color={ATS_SOURCES[src]?.color || '#6366f1'} />
              ))}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold text-white">Jobs by Department</h2>
          <div className="space-y-3.5">
            {Object.entries(stats.byDept)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 6)
              .map(([d, n]) => (
                <Bar key={d} label={d} value={n} max={deptMax} color="#818cf8" />
              ))}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold text-white">Jobs by Country</h2>
          <div className="space-y-3.5">
            {Object.entries(stats.byCountry)
              .sort((a, b) => b[1] - a[1])
              .map(([c, n]) => (
                <Bar key={c} label={c} value={n} max={countryMax} color="#34d399" />
              ))}
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <div className="flex items-center justify-between border-b border-ink-700/60 px-5 py-4">
          <h2 className="text-sm font-semibold text-white">Recently Posted</h2>
          <button
            onClick={() => setPage('jobs')}
            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-400 hover:text-indigo-300"
          >
            View all jobs <ArrowUpRight size={14} />
          </button>
        </div>
        <div className="divide-y divide-ink-700/40">
          {recent.map((j) => (
            <div key={j.job_id} className="flex items-center gap-4 px-5 py-3 hover:bg-ink-800/40">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-100">{j.title}</div>
                <div className="mt-0.5 truncate text-xs text-slate-500">
                  {j.company} · {j.location}
                </div>
              </div>
              <Pill>{j.department}</Pill>
              <div className="hidden w-28 text-right text-xs text-slate-400 sm:block">{j.salary}</div>
              <SourceBadge source={j.source} />
              <div className="w-24 text-right text-xs text-slate-500">{j.posted_date}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
