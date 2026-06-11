import { useMemo, useState } from 'react'
import { Gauge, Upload, Sparkles, CheckCircle2, AlertTriangle, Lightbulb, Loader2, FileText } from 'lucide-react'
import { Card, Button, Field, Select, Pill } from '../components/ui'
import { matchResume, fileToPayload } from '../lib/api'

function jdFromJob(job) {
  if (!job) return ''
  const skills = [job.tech_stack, job.required_skills, job.skills].flat().filter(Boolean)
  return [
    `${job.title} at ${job.company}`,
    job.location && `Location: ${job.location} (${job.remote})`,
    job.seniority && `Seniority: ${job.seniority}`,
    skills.length && `Skills: ${[...new Set(skills)].join(', ')}`,
    '',
    job.description || '',
  ].filter(Boolean).join('\n')
}

function scoreColor(n) {
  if (n >= 75) return '#22c55e'
  if (n >= 50) return '#f59e0b'
  return '#ef4444'
}

function Ring({ value }) {
  const r = 52
  const c = 2 * Math.PI * r
  const off = c * (1 - Math.max(0, Math.min(100, value)) / 100)
  const color = scoreColor(value)
  return (
    <div className="relative h-32 w-32 shrink-0">
      <svg viewBox="0 0 120 120" className="h-32 w-32 -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#25304a" strokeWidth="12" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="12"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <div className="text-3xl font-bold text-white">{value}<span className="text-lg text-slate-400">%</span></div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500">match</div>
        </div>
      </div>
    </div>
  )
}

function ChipList({ items, color }) {
  if (!items?.length) return <span className="text-xs text-slate-500">—</span>
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((s, i) => (
        <span key={i} className="rounded-full px-2.5 py-0.5 text-xs font-medium"
          style={{ backgroundColor: color + '1f', color }}>{s}</span>
      ))}
    </div>
  )
}

export default function ResumeMatch({ jobs }) {
  const [resumeText, setResumeText] = useState('')
  const [file, setFile] = useState(null)         // { name, base64 } for PDF
  const [fileName, setFileName] = useState('')
  const [jobMode, setJobMode] = useState('select')
  const [selectedId, setSelectedId] = useState('')
  const [customJD, setCustomJD] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  const selectedJob = useMemo(() => jobs.find((j) => j.job_id === selectedId), [jobs, selectedId])
  const jobText = jobMode === 'select' ? jdFromJob(selectedJob) : customJD

  async function onFile(e) {
    const f = e.target.files?.[0]
    if (!f) return
    setFileName(f.name)
    const name = f.name.toLowerCase()
    if (name.endsWith('.txt') || name.endsWith('.md')) {
      setFile(null)
      setResumeText(await f.text())
    } else {
      // PDF (or other) — send to server for extraction
      setResumeText('')
      setFile(await fileToPayload(f))
    }
  }

  async function analyze() {
    setError(null)
    setResult(null)
    if (!resumeText.trim() && !file) return setError('Add your résumé — paste text or upload a .pdf/.txt.')
    if (!jobText.trim()) return setError('Pick a job or paste a job description.')
    setBusy(true)
    try {
      const r = await matchResume({ resumeText: resumeText.trim() || undefined, file: file || undefined, jobText })
      setResult(r)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-7">
      <header className="mb-6 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-indigo-500/15 text-indigo-400">
          <Gauge size={20} />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Resume Match</h1>
          <p className="mt-0.5 text-sm text-slate-400">Score your résumé against a job and get concrete edits.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Résumé */}
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Your résumé</h2>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-ink-600 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-ink-700/50">
              <Upload size={13} /> Upload .pdf / .txt
              <input type="file" accept=".pdf,.txt,.md" className="hidden" onChange={onFile} />
            </label>
          </div>
          {fileName && (
            <div className="mb-2 inline-flex items-center gap-1.5 text-xs text-slate-400">
              <FileText size={13} /> {fileName}{file ? ' (PDF — parsed on analyze)' : ' (loaded)'}
            </div>
          )}
          <textarea
            value={resumeText}
            onChange={(e) => { setResumeText(e.target.value); setFile(null) }}
            rows={14}
            placeholder="Paste your résumé text here, or upload a file above…"
            className="w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-xs leading-relaxed text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
          />
        </Card>

        {/* Job */}
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-sm font-semibold text-white">Target job</h2>
            <div className="ml-auto flex rounded-lg border border-ink-700 p-0.5 text-xs">
              <button onClick={() => setJobMode('select')}
                className={`rounded px-2.5 py-1 ${jobMode === 'select' ? 'bg-indigo-500 text-white' : 'text-slate-400'}`}>From list</button>
              <button onClick={() => setJobMode('custom')}
                className={`rounded px-2.5 py-1 ${jobMode === 'custom' ? 'bg-indigo-500 text-white' : 'text-slate-400'}`}>Paste JD</button>
            </div>
          </div>

          {jobMode === 'select' ? (
            <>
              <Field label={`Choose a job (${jobs.length} available)`}>
                <Select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
                  <option value="">Select a job…</option>
                  {jobs.map((j) => (
                    <option key={j.job_id} value={j.job_id}>{j.title} — {j.company}</option>
                  ))}
                </Select>
              </Field>
              <pre className="mt-3 h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-ink-900 p-3 text-xs text-slate-400">
                {jobText || 'Job description preview will appear here.'}
              </pre>
            </>
          ) : (
            <textarea
              value={customJD}
              onChange={(e) => setCustomJD(e.target.value)}
              rows={14}
              placeholder="Paste the job description here…"
              className="w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-xs leading-relaxed text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
            />
          )}
        </Card>
      </div>

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      <div className="mt-5 flex justify-center">
        <Button onClick={analyze} disabled={busy} className="px-6">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {busy ? 'Analyzing…' : 'Analyze match'}
        </Button>
      </div>

      {result && (
        <Card className="mt-6 p-6">
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
            <Ring value={result.match_percent ?? 0} />
            <div className="flex-1">
              <p className="text-base font-medium text-slate-100">{result.verdict}</p>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-400">Matched skills</div>
                  <ChipList items={result.matched_skills} color="#22c55e" />
                </div>
                <div>
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-amber-400">Missing skills</div>
                  <ChipList items={result.missing_skills} color="#f59e0b" />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-white">
                <CheckCircle2 size={15} className="text-emerald-400" /> Strengths
              </div>
              <ul className="space-y-1.5 text-sm text-slate-300">
                {result.strengths?.map((s, i) => <li key={i} className="flex gap-2"><span className="text-emerald-400">•</span>{s}</li>)}
              </ul>
            </div>
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-white">
                <AlertTriangle size={15} className="text-amber-400" /> Gaps
              </div>
              <ul className="space-y-1.5 text-sm text-slate-300">
                {result.gaps?.map((s, i) => <li key={i} className="flex gap-2"><span className="text-amber-400">•</span>{s}</li>)}
              </ul>
            </div>
          </div>

          <div className="mt-6">
            <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-white">
              <Lightbulb size={15} className="text-indigo-400" /> Suggested résumé changes
            </div>
            <ol className="space-y-2 text-sm text-slate-300">
              {result.suggestions?.map((s, i) => (
                <li key={i} className="flex gap-2.5 rounded-lg bg-ink-900/60 px-3 py-2">
                  <span className="font-semibold text-indigo-400">{i + 1}.</span>{s}
                </li>
              ))}
            </ol>
          </div>
        </Card>
      )}
    </div>
  )
}
