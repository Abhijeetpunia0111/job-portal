import { useState } from 'react'
import { Search, Copy, ExternalLink, ClipboardPaste, Sparkles, Loader2, Info, Terminal, CheckCircle2 } from 'lucide-react'
import { Card, Button, Field, Input, Select } from '../components/ui'
import { MODE, saveJob } from '../lib/dataSource'
import { importNaukriJob } from '../lib/api'
import { buildNaukriSearchUrl, EXPERIENCE, JOB_AGE } from '../lib/naukriSearch'

export default function ImportNaukri() {
  const [tab, setTab] = useState('search') // 'search' | 'paste'

  // ---- Search builder ----
  const [filters, setFilters] = useState({
    keywords: '', location: '', experience: '', jobAge: '', remote: false,
  })
  const setF = (k, v) => setFilters((f) => ({ ...f, [k]: v }))
  const searchUrl = buildNaukriSearchUrl(filters)
  const [copied, setCopied] = useState(false)
  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(searchUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard unavailable */ }
  }

  // ---- Paste import ----
  const [url, setUrl] = useState('')
  const [desc, setDesc] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  async function importJob() {
    if (!desc.trim()) { setMsg({ ok: false, text: 'Paste the job description first.' }); return }
    setBusy(true)
    setMsg(null)
    try {
      const job = await importNaukriJob({ url: url.trim(), description: desc })
      await saveJob(job)
      setMsg({ ok: true, text: `Imported “${job.title}” @ ${job.company}. It’ll appear on the Jobs tab shortly.` })
      setUrl('')
      setDesc('')
    } catch (err) {
      setMsg({ ok: false, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-8 py-7">
      <header className="mb-6 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-lg text-white" style={{ backgroundColor: '#ff7555' }}>
          <Search size={20} />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Import from Naukri</h1>
          <p className="mt-0.5 text-sm text-slate-400">
            Build a filtered Naukri search, or paste a job to add it to your dashboard.
          </p>
        </div>
      </header>

      <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-ink-700/60 bg-ink-900/60 px-4 py-3 text-xs text-slate-400">
        <Info size={15} className="mt-0.5 shrink-0 text-slate-500" />
        <span>
          Naukri's job data sits behind a recaptcha-protected API, so (unlike LinkedIn) it can't be
          auto-fetched. Instead, build a search to open on Naukri, then copy a posting's text here —
          the AI structures it into your unified schema.
        </span>
      </div>

      <div className="mb-5 inline-flex rounded-lg border border-ink-700 bg-ink-900 p-0.5 text-sm">
        {[
          { id: 'search', label: 'Search by filters', icon: Search },
          { id: 'paste', label: 'Paste a job', icon: ClipboardPaste },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setMsg(null) }}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${
              tab === t.id ? 'text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
            style={tab === t.id ? { backgroundColor: '#ff7555' } : undefined}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'search' && (
        <Card className="p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Job role / keywords">
              <Input value={filters.keywords} onChange={(e) => setF('keywords', e.target.value)} placeholder="e.g. Product Designer" />
            </Field>
            <Field label="Location">
              <Input value={filters.location} onChange={(e) => setF('location', e.target.value)} placeholder="e.g. Bengaluru" />
            </Field>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Experience">
              <Select value={filters.experience} onChange={(e) => setF('experience', e.target.value)}>
                {EXPERIENCE.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
            <Field label="Date posted">
              <Select value={filters.jobAge} onChange={(e) => setF('jobAge', e.target.value)}>
                {JOB_AGE.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
          </div>
          <label className="mt-4 inline-flex cursor-pointer items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={filters.remote} onChange={(e) => setF('remote', e.target.checked)} className="accent-[#ff7555]" />
            Remote / work-from-home only
          </label>

          <div className="mt-4">
            <Field label="Search URL (built from your filters)">
              <div className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2">
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-300">{searchUrl}</span>
                <button onClick={copyUrl} title="Copy URL" className="shrink-0 text-slate-400 hover:text-slate-200"><Copy size={14} /></button>
                <a href={searchUrl} target="_blank" rel="noreferrer" title="Open on Naukri" className="shrink-0 text-slate-400 hover:text-slate-200"><ExternalLink size={14} /></a>
              </div>
            </Field>
            {copied && <div className="mt-1 text-xs text-emerald-400">Copied to clipboard.</div>}
          </div>

          <div className="mt-4 flex justify-end">
            <a href={searchUrl} target="_blank" rel="noreferrer">
              <Button style={{ backgroundColor: '#ff7555' }}><ExternalLink size={16} /> Open on Naukri</Button>
            </a>
          </div>
        </Card>
      )}

      {tab === 'paste' && (
        <Card className="p-5">
          <Field label="Naukri job URL (optional)">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.naukri.com/job-listings-...-100626505729" />
          </Field>
          <div className="mt-4">
            <Field label="Job description (paste the posting text)">
              <textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                rows={12}
                placeholder="Open the job on Naukri, select the posting (title, company, location, description, skills) and paste it here. The AI will structure it."
                className="w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-xs leading-relaxed text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
              />
            </Field>
          </div>

          {msg && (
            <div className={`mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>
              {msg.ok && <CheckCircle2 size={15} />}{msg.text}
            </div>
          )}

          {MODE !== 'supabase' && (
            <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-200/90">
              <Terminal size={15} className="mt-0.5 shrink-0" />
              <div>Connect Supabase to save imported jobs — live mode has no persistent job store.</div>
            </div>
          )}

          <div className="mt-4 flex justify-end">
            <Button onClick={importJob} disabled={busy || MODE !== 'supabase'} style={{ backgroundColor: busy ? undefined : '#ff7555' }}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {busy ? 'Importing…' : 'Import job'}
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
