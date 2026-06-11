// CSV export helpers for the unified job schema.

function escape(value) {
  const s = value == null ? '' : String(value)
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

export function jobsToCsv(jobs, columns) {
  const cols = columns || [
    'job_id', 'title', 'company', 'location', 'remote',
    'employment_type', 'department', 'salary', 'apply_url',
    'source', 'posted_date',
  ]
  const header = cols.join(',')
  const rows = jobs.map((j) => cols.map((c) => escape(j[c])).join(','))
  return [header, ...rows].join('\n')
}

export function downloadCsv(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
