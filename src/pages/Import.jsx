import { useEffect, useRef, useState } from 'react'
import { Linkedin, Plus, RefreshCw, CheckCircle2, XCircle, Clock, Terminal, Info, Search, Copy, ExternalLink } from 'lucide-react'
import { Card, Button, Field, Input, Select } from '../components/ui'
import { MODE, queueLinkedInUrls, loadLinkedInQueue, triggerLinkedInDrain } from '../lib/dataSource'
import {
  buildLinkedInSearchUrl,
  DATE_POSTED,
  EXPERIENCE,
  JOB_TYPE,
  WORKPLACE,
  SORT_BY,
} from '../lib/linkedinSearch'

// Strip surrounding double quotes so parsing/queueing stays clean.
const unquote = (s = '') => s.trim().replace(/^"+|"+$/g, '').trim()

// Light client-side check that a line contains a parseable LinkedIn job id.
function jobIdFrom(line = '') {
  const s = unquote(line)
  if (!s) return null
  if (/^\d{6,}$/.test(s)) return s
  const m =
    s.match(/jobs\/view\/(?:[^/?#]*-)?(\d+)/) ||
    s.match(/[?&]currentJobId=(\d+)/) ||
    s.match(/jobPosting:(\d+)/) ||
    s.match(/(\d{8,})/)
  return m ? m[1] : null
}

// Multi-select rendered as toggleable chips. `selected` is an array of codes.
function ChipGroup({ options, selected, onToggle }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = selected.includes(o.value)
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onToggle(o.value)}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
              on
                ? 'border-indigo-500 bg-indigo-500/15 text-indigo-200'
                : 'border-ink-700 bg-ink-900 text-slate-400 hover:border-ink-600 hover:text-slate-200'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export default function Import() {
  const [tab, setTab] = useState('urls') // 'urls' | 'search'
  const [text, setText] = useState('')
  const [queue, setQueue] = useState([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const taRef = useRef(null)

  // ---- Search-by-filters state ----
  const [filters, setFilters] = useState({
    keywords: '',
    location: '',
    datePosted: '',
    experience: [],
    jobType: [],
    workplace: [],
    sortBy: '',
  })
  const [limit, setLimit] = useState(25)
  const [copied, setCopied] = useState(false)

  const setF = (key, value) => setFilters((f) => ({ ...f, [key]: value }))
  const toggleF = (key, value) =>
    setFilters((f) => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value],
    }))

  const hasCriteria =
    filters.keywords.trim() ||
    filters.location.trim() ||
    filters.datePosted ||
    filters.experience.length ||
    filters.jobType.length ||
    filters.workplace.length
  const searchUrl = buildLinkedInSearchUrl(filters)

  async function copySearchUrl() {
    try {
      await navigator.clipboard.writeText(searchUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard unavailable */ }
  }

  async function queueSearch() {
    if (!hasCriteria) return
    setBusy(true)
    setMsg(null)
    try {
      await queueLinkedInUrls([searchUrl])
      setMsg({ ok: true, text: 'Queued a LinkedIn search — expanding into jobs automatically…' })
      await refresh()
      triggerLinkedInDrain().then(refresh) // kick off processing now; show results
    } catch (err) {
      setMsg({ ok: false, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const valid = lines.filter((l) => jobIdFrom(l))
  const invalid = lines.filter((l) => !jobIdFrom(l))

  // On Enter, wrap the line just typed in double quotes (terminal-ready), then
  // move to a fresh line. Shift+Enter inserts a plain newline.
  function onKeyDown(e) {
    if (e.key !== 'Enter' || e.shiftKey) return
    e.preventDefault()
    const el = e.target
    const caret = el.selectionStart ?? text.length
    const before = text.slice(0, caret)
    const after = text.slice(caret)
    const lineStart = before.lastIndexOf('\n') + 1
    const line = before.slice(lineStart).trim()
    const wrapped = line ? `"${unquote(line)}"` : ''
    const newBefore = before.slice(0, lineStart) + wrapped + '\n'
    setText(newBefore + after)
    requestAnimationFrame(() => {
      if (taRef.current) taRef.current.selectionStart = taRef.current.selectionEnd = newBefore.length
    })
  }

  async function refresh() {
    try { setQueue(await loadLinkedInQueue()) } catch { /* ignore */ }
  }
  useEffect(() => { refresh() }, [])

  // Auto-refresh while any row is still pending/processing, so statuses update
  // on their own as the server drains the queue — no manual Refresh needed.
  const hasActive = queue.some((q) => q.status === 'pending' || q.status === 'processing')
  useEffect(() => {
    if (MODE !== 'supabase' || !hasActive) return
    const id = setInterval(refresh, 4000)
    return () => clearInterval(id)
  }, [hasActive])

  async function submit() {
    if (!valid.length) return
    setBusy(true)
    setMsg(null)
    try {
      await queueLinkedInUrls(valid.map(unquote))
      setMsg({ ok: true, text: `Queued ${valid.length} job URL${valid.length > 1 ? 's' : ''} — processing automatically…` })
      setText('')
      await refresh()
      triggerLinkedInDrain().then(refresh) // kick off processing now; show results
    } catch (err) {
      setMsg({ ok: false, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const StatusIcon = ({ s }) =>
    s === 'done' ? <CheckCircle2 size={15} className="text-emerald-400" />
      : s === 'error' ? <XCircle size={15} className="text-red-400" />
        : s === 'processing' ? <RefreshCw size={15} className="animate-spin text-sky-400" />
          : <Clock size={15} className="text-amber-400" />

  return (
    <div className="mx-auto max-w-4xl px-8 py-7">
      <header className="mb-6 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-[#0a66c2]/15 text-[#0a66c2]">
          <Linkedin size={20} />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Import from LinkedIn</h1>
          <p className="mt-0.5 text-sm text-slate-400">
            Paste job URLs, or build a filtered search by role and location.
          </p>
        </div>
      </header>

      <div className="mb-5 inline-flex rounded-lg border border-ink-700 bg-ink-900 p-0.5 text-sm">
        {[
          { id: 'urls', label: 'Paste URLs', icon: Linkedin },
          { id: 'search', label: 'Search by filters', icon: Search },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setMsg(null) }}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${
              tab === t.id ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-ink-700/60 bg-ink-900/60 px-4 py-3 text-xs text-slate-400">
        <Info size={15} className="mt-0.5 shrink-0 text-slate-500" />
        <span>
          We parse the public job page for each URL you provide (the same page LinkedIn
          shows logged-out visitors) and normalize it into the unified schema. This is
          user-initiated and low-volume — no login, no bulk scraping. Please only submit
          listings you're authorized to access, per LinkedIn's Terms.
        </span>
      </div>

      {tab === 'urls' && (
      <Card className="p-5">
        <Field label="LinkedIn Job URLs (one per line)">
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            rows={6}
            placeholder={'https://www.linkedin.com/jobs/view/4414360574\nhttps://www.linkedin.com/jobs/view/...'}
            className="w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 font-mono text-xs text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
          />
        </Field>

        <div className="mt-2 flex items-center gap-4 text-xs">
          {valid.length > 0 && <span className="text-emerald-400">{valid.length} valid</span>}
          {invalid.length > 0 && <span className="text-amber-400">{invalid.length} unrecognized</span>}
          {lines.length === 0 && <span className="text-slate-500">Provide at least one job URL.</span>}
        </div>

        {msg && (
          <div className={`mt-3 rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>
            {msg.text}
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <Button onClick={submit} disabled={busy || !valid.length}>
            <Plus size={16} /> {busy ? 'Queuing…' : `Queue ${valid.length || ''} URL${valid.length === 1 ? '' : 's'}`}
          </Button>
        </div>
      </Card>
      )}

      {tab === 'search' && (
      <Card className="p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Job role / keywords">
            <Input
              value={filters.keywords}
              onChange={(e) => setF('keywords', e.target.value)}
              placeholder="e.g. Senior Backend Engineer"
            />
          </Field>
          <Field label="Location">
            <Input
              value={filters.location}
              onChange={(e) => setF('location', e.target.value)}
              placeholder="e.g. Bengaluru, India or Remote"
            />
          </Field>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Date posted">
            <Select value={filters.datePosted} onChange={(e) => setF('datePosted', e.target.value)}>
              {DATE_POSTED.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
          <Field label="Sort by">
            <Select value={filters.sortBy} onChange={(e) => setF('sortBy', e.target.value)}>
              {SORT_BY.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
        </div>

        <div className="mt-4 space-y-3">
          <Field label="Experience level">
            <ChipGroup options={EXPERIENCE} selected={filters.experience} onToggle={(v) => toggleF('experience', v)} />
          </Field>
          <Field label="Job type">
            <ChipGroup options={JOB_TYPE} selected={filters.jobType} onToggle={(v) => toggleF('jobType', v)} />
          </Field>
          <Field label="Workplace">
            <ChipGroup options={WORKPLACE} selected={filters.workplace} onToggle={(v) => toggleF('workplace', v)} />
          </Field>
        </div>

        <div className="mt-4">
          <Field label="Search URL (built from your filters)">
            <div className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2">
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-300">{searchUrl}</span>
              <button onClick={copySearchUrl} title="Copy URL" className="shrink-0 text-slate-400 hover:text-slate-200">
                <Copy size={14} />
              </button>
              <a href={searchUrl} target="_blank" rel="noreferrer" title="Open in LinkedIn" className="shrink-0 text-slate-400 hover:text-slate-200">
                <ExternalLink size={14} />
              </a>
            </div>
          </Field>
          {copied && <div className="mt-1 text-xs text-emerald-400">Copied to clipboard.</div>}
        </div>

        {msg && (
          <div className={`mt-3 rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>
            {msg.text}
          </div>
        )}

        {MODE === 'supabase' ? (
          <div className="mt-4 flex items-center justify-end gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-400">
              Max jobs
              <input
                type="number"
                min={1}
                max={100}
                value={limit}
                onChange={(e) => setLimit(Math.max(1, Math.min(100, Number(e.target.value) || 25)))}
                className="w-16 rounded-md border border-ink-700 bg-ink-900 px-2 py-1 text-slate-100 focus:border-indigo-500 focus:outline-none"
              />
            </label>
            <Button onClick={queueSearch} disabled={busy || !hasCriteria}>
              <Search size={16} /> {busy ? 'Queuing…' : 'Queue search'}
            </Button>
          </div>
        ) : (
          <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-200/90">
            <Terminal size={15} className="mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">Run this search from the terminal:</div>
              <code className="mt-1 block break-all rounded bg-ink-900 px-2 py-1 text-xs">
                npm run linkedin -- "{searchUrl}" --limit {limit}
              </code>
            </div>
          </div>
        )}
      </Card>
      )}

      {MODE !== 'supabase' && tab === 'urls' && (
        <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-200/90">
          <Terminal size={15} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-medium">Live mode — queueing needs Supabase.</div>
            <div className="mt-1 text-xs text-amber-200/70">
              Parse a URL right now from the terminal instead:
              <code className="ml-1 rounded bg-ink-900 px-1.5 py-0.5">npm run linkedin -- &lt;url&gt;</code>
            </div>
          </div>
        </div>
      )}

      {MODE === 'supabase' && (
        <Card className="mt-6 overflow-hidden">
          <div className="flex items-center justify-between border-b border-ink-700/60 px-5 py-3.5">
            <h2 className="text-sm font-semibold text-white">Submitted URLs</h2>
            <button onClick={refresh} className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200">
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
          {queue.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-slate-500">No URLs submitted yet.</div>
          ) : (
            <div className="divide-y divide-ink-700/40">
              {queue.map((q) => (
                <div key={q.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  <StatusIcon s={q.status} />
                  <span className="min-w-0 flex-1 truncate text-slate-300">{q.url}</span>
                  {q.error && <span className="truncate text-xs text-red-400/80">{q.error}</span>}
                  <span className="text-xs capitalize text-slate-500">{q.status}</span>
                </div>
              ))}
            </div>
          )}
          <div className="border-t border-ink-700/60 px-5 py-3 text-xs text-slate-500">
            Submitted URLs are processed automatically by the server (auto-checked every minute; statuses
            refresh on their own). The queue is emptied every 24 hours.
          </div>
        </Card>
      )}
    </div>
  )
}
