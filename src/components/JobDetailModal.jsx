import { useEffect, useState } from 'react'
import {
  X, MapPin, Building2, Briefcase, BadgeCheck, CalendarDays, DollarSign,
  ExternalLink, Linkedin, Users, Mail, Upload, FileText, Sparkles, Loader2,
  Copy, Check, AlertTriangle,
} from 'lucide-react'
import { Button, SourceBadge, Pill } from './ui'
import { peopleSearchUrls, companyLinkedInUrl } from '../lib/linkedinSearch'
import { writeOutreachEmail, fileToPayload } from '../lib/api'

// Compose a plain-text job description for the AI from the structured fields.
function jobToJD(job) {
  const skills = [job.tech_stack, job.required_skills, job.skills].flat().filter(Boolean)
  return [
    `${job.title} at ${job.company}`,
    job.location && `Location: ${job.location} (${job.remote})`,
    job.seniority && `Seniority: ${job.seniority}`,
    job.employment_type && `Employment type: ${job.employment_type}`,
    skills.length && `Skills: ${[...new Set(skills)].join(', ')}`,
    '',
    job.description || '',
  ].filter(Boolean).join('\n')
}

function MetaRow({ icon: Icon, children }) {
  if (!children) return null
  return (
    <div className="flex items-center gap-2 text-sm text-slate-300">
      <Icon size={15} className="shrink-0 text-slate-500" />
      <span>{children}</span>
    </div>
  )
}

export default function JobDetailModal({ job, onClose }) {
  const [showMail, setShowMail] = useState(false)
  const [resumeText, setResumeText] = useState('')
  const [file, setFile] = useState(null)
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [email, setEmail] = useState(null) // { subject, body }
  const [copied, setCopied] = useState(false)

  // Close on Escape.
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!job) return null

  const skills = (job.tech_stack?.length ? job.tech_stack : job.skills) || []
  const people = peopleSearchUrls(job)

  async function onFile(e) {
    const f = e.target.files?.[0]
    if (!f) return
    setFileName(f.name)
    const name = f.name.toLowerCase()
    if (name.endsWith('.txt') || name.endsWith('.md')) {
      setFile(null)
      setResumeText(await f.text())
    } else {
      setResumeText('')
      setFile(await fileToPayload(f))
    }
  }

  async function generate() {
    setError(null)
    setEmail(null)
    if (!resumeText.trim() && !file) {
      setError('Add your résumé first — paste text or upload a .pdf/.txt.')
      return
    }
    setBusy(true)
    try {
      const r = await writeOutreachEmail({
        resumeText: resumeText.trim() || undefined,
        file: file || undefined,
        jobText: jobToJD(job),
      })
      setEmail(r)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(`Subject: ${email.subject}\n\n${email.body}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard unavailable */ }
  }

  const mailto = email
    ? `mailto:?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`
    : '#'

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/60 p-4 backdrop-blur-sm sm:p-8"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Side-by-side group: job card + (optional) mail panel. Centered as a unit,
          so when the mail panel expands the job card glides left to make room. */}
      <div className="my-auto flex items-start">
      <div className="w-full max-w-3xl shrink-0 rounded-2xl border border-ink-700/70 bg-ink-850 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-ink-700/60 px-6 py-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold text-white">{job.title}</h2>
              {job.job_category && (
                <span className="rounded-md bg-indigo-500/15 px-2 py-0.5 text-xs font-medium text-indigo-300">
                  {job.job_category}
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-2 text-sm text-slate-400">
              <Building2 size={14} /> {job.company}
              <SourceBadge source={job.source} />
            </div>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-ink-700/60 hover:text-slate-200">
            <X size={20} />
          </button>
        </div>

        <div className="max-h-[calc(100vh-12rem)] overflow-y-auto px-6 py-5">
          {/* Meta grid */}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <MetaRow icon={MapPin}>{job.location}{job.remote ? ` · ${job.remote}` : ''}</MetaRow>
            <MetaRow icon={Briefcase}>{job.department}</MetaRow>
            <MetaRow icon={BadgeCheck}>{job.seniority || job.ai_seniority}</MetaRow>
            <MetaRow icon={Briefcase}>{job.employment_type}</MetaRow>
            <MetaRow icon={DollarSign}>{job.salary}</MetaRow>
            <MetaRow icon={CalendarDays}>{job.posted_date && `Posted ${job.posted_date}`}</MetaRow>
          </div>

          {/* Skills */}
          {skills.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {skills.map((s) => <Pill key={s}>{s}</Pill>)}
            </div>
          )}

          {/* Apply actions */}
          <div className="mt-4 flex flex-wrap gap-2">
            {job.apply_url && (
              <a href={job.apply_url} target="_blank" rel="noreferrer">
                <Button><ExternalLink size={15} /> Apply</Button>
              </a>
            )}
            {job.linkedin_url && (
              <a href={job.linkedin_url} target="_blank" rel="noreferrer">
                <Button variant="outline"><Linkedin size={15} /> View on LinkedIn</Button>
              </a>
            )}
            <Button variant={showMail ? 'default' : 'outline'} onClick={() => setShowMail((v) => !v)}>
              <Mail size={15} /> Write a mail
            </Button>
          </div>

          {/* Description */}
          {job.description && (
            <div className="mt-6">
              <h3 className="mb-2 text-sm font-semibold text-white">Job description</h3>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{job.description}</p>
            </div>
          )}

          {/* People to reach on LinkedIn */}
          {people.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-white">
                <Users size={15} className="text-[#0a66c2]" /> People to reach on LinkedIn
              </h3>
              <p className="mb-2.5 text-xs text-slate-500">
                Open a LinkedIn people search for likely contacts at {job.company}. Connect or message them with the email below.
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {people.map((p) => (
                  <a
                    key={p.url}
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-2 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-slate-200 hover:border-[#0a66c2]/60 hover:bg-[#0a66c2]/5"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{p.label}</span>
                      <span className="block truncate text-xs text-slate-500">{p.hint}</span>
                    </span>
                    <Linkedin size={15} className="shrink-0 text-[#0a66c2]" />
                  </a>
                ))}
                <a
                  href={companyLinkedInUrl(job.company)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between gap-2 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-slate-200 hover:border-[#0a66c2]/60 hover:bg-[#0a66c2]/5"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{job.company} on LinkedIn</span>
                    <span className="block truncate text-xs text-slate-500">Company page</span>
                  </span>
                  <Building2 size={15} className="shrink-0 text-[#0a66c2]" />
                </a>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Mail panel — expands in from the right, gliding the job card left.
          Kept mounted so width/opacity can transition smoothly both ways. */}
      <div
        className={`overflow-hidden transition-all duration-300 ease-out ${
          showMail ? 'ml-4 w-[26rem] opacity-100' : 'pointer-events-none ml-0 w-0 opacity-0'
        }`}
      >
        <div className="flex w-[26rem] flex-col rounded-2xl border border-ink-700/70 bg-ink-850 shadow-2xl">
          {/* Mail panel header */}
          <div className="flex items-center justify-between gap-3 border-b border-ink-700/60 px-5 py-4">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-white">
              <Sparkles size={15} className="text-indigo-400" /> AI outreach email
            </h3>
            <div className="flex items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-ink-600 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-ink-700/50">
                <Upload size={13} /> Upload .pdf / .txt
                <input type="file" accept=".pdf,.txt,.md" className="hidden" onChange={onFile} />
              </label>
              <button onClick={() => setShowMail(false)} title="Close"
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-ink-700/60 hover:text-slate-200">
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="max-h-[calc(100vh-12rem)] overflow-y-auto px-5 py-4">
            {fileName && (
              <div className="mb-2 inline-flex items-center gap-1.5 text-xs text-slate-400">
                <FileText size={13} /> {fileName}{file ? ' (PDF — parsed on generate)' : ' (loaded)'}
              </div>
            )}
            <textarea
              value={resumeText}
              onChange={(e) => { setResumeText(e.target.value); setFile(null) }}
              rows={5}
              placeholder="Paste your résumé here (or upload above). The AI reads it against this job to draft your email."
              className="w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-xs leading-relaxed text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
            />

            {error && (
              <div className="mt-2 flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
                <AlertTriangle size={14} /> {error}
              </div>
            )}

            <div className="mt-3">
              <Button onClick={generate} disabled={busy}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                {busy ? 'Writing…' : email ? 'Regenerate email' : 'Generate email'}
              </Button>
            </div>

            {email && (
              <div className="mt-4 space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Subject</label>
                  <input
                    value={email.subject}
                    onChange={(e) => setEmail((m) => ({ ...m, subject: e.target.value }))}
                    className="w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Body</label>
                  <textarea
                    value={email.body}
                    onChange={(e) => setEmail((m) => ({ ...m, body: e.target.value }))}
                    rows={12}
                    className="w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm leading-relaxed text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={copyEmail}>
                    {copied ? <Check size={15} className="text-emerald-400" /> : <Copy size={15} />}
                    {copied ? 'Copied' : 'Copy email'}
                  </Button>
                  <a href={mailto}>
                    <Button><Mail size={15} /> Open in mail app</Button>
                  </a>
                </div>
                <p className="text-xs text-slate-500">
                  Tip: add the recipient after finding them via the LinkedIn searches above. Edit anything before sending.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}
