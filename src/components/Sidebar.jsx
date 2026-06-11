import { LayoutDashboard, Building2, Briefcase, Network, Settings, Linkedin, Gauge, Search } from 'lucide-react'

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'jobs', label: 'Jobs', icon: Briefcase },
  { id: 'match', label: 'Resume Match', icon: Gauge },
  { id: 'companies', label: 'Companies', icon: Building2 },
  { id: 'import', label: 'Import from LinkedIn', icon: Linkedin },
  { id: 'naukri', label: 'Import from Naukri', icon: Search },
  { id: 'sources', label: 'Sources', icon: Network },
]

export default function Sidebar({ page, setPage, jobCount, companyCount }) {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-ink-700/60 bg-ink-900">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-indigo-500/15 text-indigo-400">
          <Briefcase size={20} />
        </div>
        <div>
          <div className="text-sm font-semibold leading-tight text-white">JobIntel</div>
          <div className="text-[11px] text-slate-500">Job Intelligence</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2">
        {NAV.map(({ id, label, icon: Icon }) => {
          const active = page === id
          return (
            <button
              key={id}
              onClick={() => setPage(id)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? 'bg-indigo-500/15 text-indigo-300'
                  : 'text-slate-400 hover:bg-ink-800 hover:text-slate-200'
              }`}
            >
              <Icon size={18} />
              {label}
              {id === 'jobs' && (
                <span className="ml-auto rounded-md bg-ink-700/70 px-1.5 py-0.5 text-[11px] text-slate-400">
                  {jobCount}
                </span>
              )}
              {id === 'companies' && (
                <span className="ml-auto rounded-md bg-ink-700/70 px-1.5 py-0.5 text-[11px] text-slate-400">
                  {companyCount}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      <div className="border-t border-ink-700/60 px-3 py-3">
        <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 hover:bg-ink-800 hover:text-slate-200">
          <Settings size={18} />
          Settings
        </button>
        <div className="px-3 pt-3 text-[11px] leading-relaxed text-slate-600">
          Company-first aggregation across Greenhouse, Lever, Workday, SmartRecruiters &amp; Ashby.
        </div>
      </div>
    </aside>
  )
}
