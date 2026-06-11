import { useMemo, useState } from 'react'
import { Search, Download, ExternalLink, Linkedin, ArrowUpDown, X, Trash2 } from 'lucide-react'
import { Card, Button, Input, Select, SourceBadge, Pill } from '../components/ui'
import { ATS_SOURCES } from '../lib/ats'
import { jobsToCsv, downloadCsv } from '../lib/csv'
import { MODE } from '../lib/dataSource'
import JobDetailModal from '../components/JobDetailModal'

const EMPTY = {
  q: '', location: '', remote: '', department: '', company: '', source: '', seniority: '', minSalary: '', category: '',
}

export default function Jobs({ jobs, companies, deleteAllJobs, deleteJobs }) {
  const [f, setF] = useState(EMPTY)
  const [sort, setSort] = useState({ key: 'posted_date', dir: 'desc' })
  const [selected, setSelected] = useState(() => new Set())
  const [deleting, setDeleting] = useState(false)
  const [openJob, setOpenJob] = useState(null)
  const canDelete = MODE === 'supabase'

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }))

  const options = useMemo(() => {
    const uniq = (key) => [...new Set(jobs.map((j) => j[key]).filter(Boolean))].sort()
    return {
      locations: uniq('location'),
      departments: uniq('department'),
      seniorities: uniq('seniority'),
      categories: uniq('job_category'),
      companies: companies.map((c) => c.name).sort(),
      sources: [...new Set(jobs.map((j) => j.source))],
    }
  }, [jobs, companies])

  const filtered = useMemo(() => {
    const q = f.q.trim().toLowerCase()
    let rows = jobs.filter((j) => {
      if (q) {
        const hay = `${j.title} ${j.company} ${j.skills?.join(' ')} ${j.tech_stack?.join(' ')} ${j.required_skills?.join(' ')} ${j.description}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (f.location && j.location !== f.location) return false
      if (f.remote && j.remote !== f.remote) return false
      if (f.department && j.department !== f.department) return false
      if (f.company && j.company !== f.company) return false
      if (f.source && j.source !== f.source) return false
      if (f.seniority && j.seniority !== f.seniority) return false
      if (f.category && j.job_category !== f.category) return false
      if (f.minSalary && (j.salary_max || 0) < Number(f.minSalary)) return false
      return true
    })
    const { key, dir } = sort
    rows = [...rows].sort((a, b) => {
      const av = a[key] ?? ''
      const bv = b[key] ?? ''
      const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv))
      return dir === 'asc' ? cmp : -cmp
    })
    return rows
  }, [jobs, f, sort])

  const activeFilters = Object.entries(f).filter(([, v]) => v).length

  function toggleSort(key) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  }

  function toggleRow(id) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const allOnPageSelected = filtered.length > 0 && filtered.every((j) => selected.has(j.job_id))
  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allOnPageSelected) filtered.forEach((j) => next.delete(j.job_id))
      else filtered.forEach((j) => next.add(j.job_id))
      return next
    })
  }

  function exportCsv(which) {
    let rows = filtered
    let name = `jobs-filtered-${filtered.length}.csv`
    if (which === 'all') { rows = jobs; name = `jobs-all-${jobs.length}.csv` }
    if (which === 'selected') {
      rows = jobs.filter((j) => selected.has(j.job_id))
      name = `jobs-selected-${rows.length}.csv`
    }
    // Include enriched columns in the export when any row has them.
    const enriched = rows.some((j) => j.job_category)
    const cols = enriched
      ? ['job_id', 'title', 'company', 'location', 'remote', 'employment_type',
         'department', 'job_category', 'ai_seniority', 'experience_min', 'experience_max',
         'salary', 'apply_url', 'source', 'posted_date']
      : undefined
    downloadCsv(name, jobsToCsv(rows, cols))
  }

  async function handleDeleteAll() {
    if (!jobs.length || deleting) return
    if (!window.confirm(`Delete all ${jobs.length} jobs? This permanently removes them from the database and cannot be undone.`)) return
    setDeleting(true)
    try {
      await deleteAllJobs()
      setSelected(new Set())
    } catch (err) {
      alert(`Could not delete jobs: ${err.message}`)
    } finally {
      setDeleting(false)
    }
  }

  async function handleDeleteSelected() {
    const ids = [...selected]
    if (!ids.length || deleting) return
    if (!window.confirm(`Delete ${ids.length} selected job${ids.length > 1 ? 's' : ''}? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await deleteJobs(ids)
      setSelected(new Set())
    } catch (err) {
      alert(`Could not delete jobs: ${err.message}`)
    } finally {
      setDeleting(false)
    }
  }

  const Th = ({ k, children, className = '' }) => (
    <th className={`px-3 py-2.5 text-left font-medium ${className}`}>
      <button onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-slate-200">
        {children}
        <ArrowUpDown size={12} className={sort.key === k ? 'text-indigo-400' : 'text-slate-600'} />
      </button>
    </th>
  )

  return (
    <div className="mx-auto max-w-[1400px] px-8 py-7">
      <header className="mb-5 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Jobs</h1>
          <p className="mt-1 text-sm text-slate-400">
            {filtered.length} of {jobs.length} jobs
            {selected.size > 0 && <span className="text-indigo-400"> · {selected.size} selected</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => exportCsv('all')}>
            <Download size={15} /> All
          </Button>
          <Button variant="outline" disabled={selected.size === 0} onClick={() => exportCsv('selected')}>
            <Download size={15} /> Selected
          </Button>
          <Button onClick={() => exportCsv('filtered')}>
            <Download size={15} /> Export Filtered
          </Button>
          {canDelete && (
            <>
              {selected.size > 0 && (
                <Button
                  variant="outline"
                  disabled={deleting}
                  onClick={handleDeleteSelected}
                  className="border-red-500/40 text-red-300 hover:bg-red-500/10"
                >
                  <Trash2 size={15} /> Delete Selected
                </Button>
              )}
              <Button
                variant="outline"
                disabled={deleting || jobs.length === 0}
                onClick={handleDeleteAll}
                className="border-red-500/40 text-red-300 hover:bg-red-500/10"
              >
                <Trash2 size={15} /> {deleting ? 'Deleting…' : 'Delete All'}
              </Button>
            </>
          )}
        </div>
      </header>

      <Card className="mb-5 p-4">
        <div className="relative mb-3">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <Input
            value={f.q}
            onChange={set('q')}
            placeholder="Search title, company, skills, description…"
            className="pl-9"
          />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Select value={f.company} onChange={set('company')}>
            <option value="">All companies</option>
            {options.companies.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Select value={f.source} onChange={set('source')}>
            <option value="">All sources</option>
            {options.sources.map((s) => <option key={s} value={s}>{ATS_SOURCES[s]?.label || s}</option>)}
          </Select>
          <Select value={f.department} onChange={set('department')}>
            <option value="">All departments</option>
            {options.departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </Select>
          <Select value={f.location} onChange={set('location')}>
            <option value="">All locations</option>
            {options.locations.map((l) => <option key={l} value={l}>{l}</option>)}
          </Select>
          <Select value={f.remote} onChange={set('remote')}>
            <option value="">Any work mode</option>
            <option value="Remote">Remote</option>
            <option value="Hybrid">Hybrid</option>
            <option value="On-site">On-site</option>
          </Select>
          <Select value={f.seniority} onChange={set('seniority')}>
            <option value="">Any seniority</option>
            {options.seniorities.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          {options.categories.length > 0 && (
            <Select value={f.category} onChange={set('category')}>
              <option value="">Any category</option>
              {options.categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          )}
          <Select value={f.minSalary} onChange={set('minSalary')}>
            <option value="">Any salary</option>
            <option value="80000">80k+</option>
            <option value="120000">120k+</option>
            <option value="160000">160k+</option>
            <option value="200000">200k+</option>
          </Select>
        </div>
        {activeFilters > 0 && (
          <button
            onClick={() => setF(EMPTY)}
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-200"
          >
            <X size={13} /> Clear {activeFilters} filter{activeFilters > 1 ? 's' : ''}
          </button>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-ink-700/60 bg-ink-900/50 text-xs text-slate-400">
              <tr>
                <th className="w-10 px-3 py-2.5">
                  <input type="checkbox" checked={allOnPageSelected} onChange={toggleAll} className="accent-indigo-500" />
                </th>
                <Th k="title">Title</Th>
                <Th k="company">Company</Th>
                <Th k="location">Location</Th>
                <Th k="department">Department</Th>
                <Th k="salary_max" className="text-right">Salary</Th>
                <Th k="source">Source</Th>
                <Th k="posted_date">Posted</Th>
                <th className="px-3 py-2.5 text-right font-medium">Apply</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700/40">
              {filtered.map((j) => (
                <tr key={j.job_id} className={`hover:bg-ink-800/40 ${selected.has(j.job_id) ? 'bg-indigo-500/5' : ''}`}>
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={selected.has(j.job_id)}
                      onChange={() => toggleRow(j.job_id)}
                      className="accent-indigo-500"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setOpenJob(j)}
                        className="text-left font-medium text-slate-100 hover:text-indigo-300 hover:underline"
                      >
                        {j.title}
                      </button>
                      {j.job_category && (
                        <span className="rounded-md bg-indigo-500/15 px-1.5 py-0.5 text-[11px] font-medium text-indigo-300">
                          {j.job_category}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {((j.tech_stack?.length ? j.tech_stack : j.skills) || []).slice(0, 4).map((s) => (
                        <Pill key={s}>{s}</Pill>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-300">{j.company}</td>
                  <td className="px-3 py-2.5">
                    <div className="text-slate-300">{j.location}</div>
                    <div className="text-xs text-slate-500">{j.remote}</div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-400">{j.department}</td>
                  <td className="px-3 py-2.5 text-right text-slate-300">{j.salary}</td>
                  <td className="px-3 py-2.5"><SourceBadge source={j.source} /></td>
                  <td className="px-3 py-2.5 text-slate-500">{j.posted_date}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-2">
                      <a href={j.linkedin_url} target="_blank" rel="noreferrer" title="LinkedIn posting"
                         className="text-slate-500 hover:text-[#0a66c2]">
                        <Linkedin size={15} />
                      </a>
                      <a href={j.apply_url} target="_blank" rel="noreferrer" title="Apply"
                         className="text-slate-500 hover:text-indigo-400">
                        <ExternalLink size={15} />
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-16 text-center text-sm text-slate-500">
                    No jobs match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {openJob && <JobDetailModal job={openJob} onClose={() => setOpenJob(null)} />}
    </div>
  )
}
