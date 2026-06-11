import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, RefreshCw, AlertTriangle, Database, Globe } from 'lucide-react'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Jobs from './pages/Jobs'
import Companies from './pages/Companies'
import Import from './pages/Import'
import ResumeMatch from './pages/ResumeMatch'
import Sources from './pages/Sources'
import { MODE, loadCompanies, loadJobs, addCompany as addCo, updateCompany as updateCo, removeCompany as removeCo, crawlCompany, deleteAllJobs, deleteJobs } from './lib/dataSource'

export default function App() {
  const [page, setPage] = useState('dashboard')
  const [companies, setCompanies] = useState([])
  const [jobs, setJobs] = useState([])
  const [status, setStatus] = useState({ loading: true, error: null, refreshing: false })
  const refreshInFlight = useRef(false)

  const refresh = useCallback(async () => {
    if (refreshInFlight.current) return
    refreshInFlight.current = true
    setStatus((s) => ({ ...s, refreshing: true, error: null }))
    try {
      const cos = await loadCompanies()
      setCompanies(cos)
      const js = await loadJobs(cos)
      setJobs(js)
      setStatus({ loading: false, error: null, refreshing: false })
    } catch (err) {
      setStatus({ loading: false, error: err.message || String(err), refreshing: false })
    } finally {
      refreshInFlight.current = false
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    if (MODE !== 'supabase') return
    const id = setInterval(refresh, 10000)
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [refresh])

  async function handleAdd(company) {
    setCompanies((prev) => [company, ...prev])
    await addCo(company)
    try {
      const fresh = await crawlCompany(company)
      setJobs((prev) => [...fresh, ...prev])
    } catch {
      /* board may be empty or unreachable — company still added */
    }
  }

  async function handleUpdate(company) {
    const prev = companies.find((c) => c.id === company.id)
    setCompanies((list) => list.map((c) => (c.id === company.id ? company : c)))
    // Keep jobs in sync if the company was renamed (jobs reference company by name).
    if (prev && prev.name !== company.name) {
      setJobs((list) => list.map((j) => (j.company === prev.name ? { ...j, company: company.name } : j)))
    }
    await updateCo(company)
  }

  async function handleRemove(id) {
    const co = companies.find((c) => c.id === id)
    setCompanies((prev) => prev.filter((c) => c.id !== id))
    if (co) setJobs((prev) => prev.filter((j) => j.company !== co.name))
    await removeCo(id)
  }

  async function handleRecrawl(id) {
    const co = companies.find((c) => c.id === id)
    if (!co) return
    const fresh = await crawlCompany(co)
    setJobs((prev) => [...fresh, ...prev.filter((j) => j.company !== co.name)])
  }

  async function handleDeleteAllJobs() {
    await deleteAllJobs()
    setJobs([])
  }

  async function handleDeleteJobs(ids) {
    await deleteJobs(ids)
    const drop = new Set(ids)
    setJobs((prev) => prev.filter((j) => !drop.has(j.job_id)))
  }

  if (status.loading) {
    return (
      <div className="grid h-full place-items-center">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Loader2 className="animate-spin text-indigo-400" size={28} />
          <div className="text-sm">
            {MODE === 'live' ? 'Fetching live jobs from career portals…' : 'Loading jobs from Supabase…'}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full">
      <Sidebar page={page} setPage={setPage} jobCount={jobs.length} companyCount={companies.length} />
      <main className="flex-1 overflow-y-auto">
        <ModeBanner mode={MODE} refreshing={status.refreshing} error={status.error} onRefresh={refresh} />
        {page === 'dashboard' && <Dashboard jobs={jobs} companies={companies} setPage={setPage} />}
        {page === 'jobs' && (
          <Jobs
            jobs={jobs}
            companies={companies}
            deleteAllJobs={handleDeleteAllJobs}
            deleteJobs={handleDeleteJobs}
          />
        )}
        {page === 'match' && <ResumeMatch jobs={jobs} />}
        {page === 'companies' && (
          <Companies
            companies={companies}
            jobs={jobs}
            addCompany={handleAdd}
            updateCompany={handleUpdate}
            removeCompany={handleRemove}
            recrawl={handleRecrawl}
            resetData={refresh}
          />
        )}
        {page === 'import' && <Import />}
        {page === 'sources' && <Sources jobs={jobs} companies={companies} />}
      </main>
    </div>
  )
}

function ModeBanner({ mode, refreshing, error, onRefresh }) {
  return (
    <div className="flex items-center gap-3 border-b border-ink-700/60 bg-ink-900/60 px-8 py-2.5 text-xs">
      {mode === 'supabase' ? (
        <span className="inline-flex items-center gap-1.5 text-emerald-400">
          <Database size={13} /> Supabase
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-sky-400">
          <Globe size={13} /> Live mode — jobs fetched directly from public ATS APIs
        </span>
      )}
      {error && (
        <span className="inline-flex items-center gap-1.5 text-amber-400">
          <AlertTriangle size={13} /> {error}
        </span>
      )}
      <button
        onClick={onRefresh}
        disabled={refreshing}
        className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-slate-400 hover:bg-ink-700/60 hover:text-slate-200 disabled:opacity-50"
      >
        <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> Refresh
      </button>
    </div>
  )
}
