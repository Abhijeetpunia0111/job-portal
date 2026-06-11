import { useState } from 'react'
import { Plus, RefreshCw, Trash2, Pencil, Sparkles, RotateCcw, ExternalLink } from 'lucide-react'
import { Card, Button, Input, Select, Field, SourceBadge, StatusBadge } from '../components/ui'
import { detectAts, extractSlug, ATS_SOURCES } from '../lib/ats'

const BLANK = {
  name: '', url: '', slug: '', industry: '', country: 'USA', status: 'active', frequency: 'daily',
}

export default function Companies({ companies, jobs, addCompany, updateCompany, removeCompany, recrawl, resetData }) {
  const [form, setForm] = useState(BLANK)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  // When set, the form is editing this existing company id instead of adding a new one.
  const [editingId, setEditingId] = useState(null)

  const detected = form.url ? detectAts(form.url) : null
  // Auto-derive the board slug from the URL unless the user typed one.
  const slug = form.slug.trim() || (form.url ? extractSlug(form.url) : '')

  function set(k) {
    return (e) => setForm((p) => ({ ...p, [k]: e.target.value }))
  }

  function startAdd() {
    setEditingId(null)
    setForm(BLANK)
    setOpen(true)
  }

  function startEdit(c) {
    setEditingId(c.id)
    setForm({
      name: c.name, url: c.url, slug: c.slug || '', industry: c.industry === '—' ? '' : c.industry,
      country: c.country, status: c.status, frequency: c.frequency,
    })
    setOpen(true)
  }

  function cancel() {
    setOpen(false)
    setEditingId(null)
    setForm(BLANK)
  }

  async function submit(e) {
    e.preventDefault()
    if (!form.name.trim() || !form.url.trim() || !slug) return
    setBusy(true)
    try {
      const company = {
        // Keep the original id when editing so existing jobs stay linked.
        id: editingId || slug.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name: form.name.trim(),
        url: form.url.replace(/^https?:\/\//, '').trim(),
        ats: detectAts(form.url),
        slug,
        industry: form.industry.trim() || '—',
        country: form.country,
        status: form.status,
        frequency: form.frequency,
      }
      if (editingId) await updateCompany(company)
      else await addCompany(company)
      cancel()
    } finally {
      setBusy(false)
    }
  }

  const jobCount = (name) => jobs.filter((j) => j.company === name).length

  return (
    <div className="mx-auto max-w-7xl px-8 py-7">
      <header className="mb-5 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Companies</h1>
          <p className="mt-1 text-sm text-slate-400">
            Manage career portals and crawl schedules. ATS type is auto-detected from the URL.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={resetData} title="Reset to seed data">
            <RotateCcw size={15} /> Reset
          </Button>
          <Button onClick={() => (open && !editingId ? cancel() : startAdd())}>
            <Plus size={16} /> Add Company
          </Button>
        </div>
      </header>

      {open && (
        <Card className="mb-6 p-5">
          <form onSubmit={submit} className="space-y-4">
            <h2 className="text-sm font-semibold text-white">
              {editingId ? 'Edit Company' : 'Add Company'}
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Field label="Company Name">
                <Input value={form.name} onChange={set('name')} placeholder="e.g. Figma" autoFocus />
              </Field>
              <Field label="Career Portal URL">
                <Input value={form.url} onChange={set('url')} placeholder="boards.greenhouse.io/figma" />
              </Field>
              <Field label="Board Slug">
                <Input value={form.slug} onChange={set('slug')} placeholder={slug || 'auto from URL'} />
              </Field>
              <Field label="Industry">
                <Input value={form.industry} onChange={set('industry')} placeholder="Design Software" />
              </Field>
              <Field label="Country">
                <Select value={form.country} onChange={set('country')}>
                  {['USA', 'India', 'Germany', 'UK', 'Canada', 'Remote'].map((c) => <option key={c}>{c}</option>)}
                </Select>
              </Field>
              <Field label="Status">
                <Select value={form.status} onChange={set('status')}>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                </Select>
              </Field>
              <Field label="Crawl Frequency">
                <Select value={form.frequency} onChange={set('frequency')}>
                  {['hourly', 'daily', 'weekly'].map((c) => <option key={c}>{c}</option>)}
                </Select>
              </Field>
            </div>

            {detected && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-ink-700/60 bg-ink-900/60 px-4 py-3 text-sm">
                <Sparkles size={15} className="text-indigo-400" />
                <span className="text-slate-400">Auto-detected:</span>
                <SourceBadge source={detected} />
                <span className="text-slate-500">{ATS_SOURCES[detected].note}</span>
                <code className="ml-auto truncate rounded bg-ink-800 px-2 py-1 text-xs text-slate-400">
                  {ATS_SOURCES[detected].feed(slug)}
                </code>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" type="button" onClick={cancel}>Cancel</Button>
              <Button type="submit" disabled={busy}>
                {editingId ? <Pencil size={16} /> : <Plus size={16} />}
                {editingId
                  ? (busy ? 'Saving…' : 'Save Changes')
                  : (busy ? 'Crawling…' : 'Add & Crawl')}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-ink-700/60 bg-ink-900/50 text-xs text-slate-400">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Company</th>
                <th className="px-4 py-3 text-left font-medium">ATS Source</th>
                <th className="px-4 py-3 text-left font-medium">Industry</th>
                <th className="px-4 py-3 text-left font-medium">Country</th>
                <th className="px-4 py-3 text-right font-medium">Jobs</th>
                <th className="px-4 py-3 text-left font-medium">Frequency</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700/40">
              {companies.map((c) => (
                <tr key={c.id} className="hover:bg-ink-800/40">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-100">{c.name}</div>
                    <a href={'https://' + c.url} target="_blank" rel="noreferrer"
                       className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-400">
                      {c.url} <ExternalLink size={11} />
                    </a>
                  </td>
                  <td className="px-4 py-3"><SourceBadge source={c.ats} /></td>
                  <td className="px-4 py-3 text-slate-400">{c.industry}</td>
                  <td className="px-4 py-3 text-slate-400">{c.country}</td>
                  <td className="px-4 py-3 text-right font-medium text-slate-200">{jobCount(c.name)}</td>
                  <td className="px-4 py-3 text-slate-400 capitalize">{c.frequency}</td>
                  <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => recrawl(c.id)} title="Re-crawl now"
                              className="rounded-md p-1.5 text-slate-500 hover:bg-ink-700/60 hover:text-indigo-400">
                        <RefreshCw size={15} />
                      </button>
                      <button onClick={() => startEdit(c)} title="Edit"
                              className="rounded-md p-1.5 text-slate-500 hover:bg-ink-700/60 hover:text-indigo-400">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => removeCompany(c.id)} title="Remove"
                              className="rounded-md p-1.5 text-slate-500 hover:bg-ink-700/60 hover:text-red-400">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
