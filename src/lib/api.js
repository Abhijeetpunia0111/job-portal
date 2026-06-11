// Calls the local match API (server/index.js), proxied at /api in dev.

export async function matchResume({ resumeText, file, jobText }) {
  const res = await fetch('/api/match', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resumeText, file, jobText }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Match API error ${res.status}`)
  return data
}

// Draft an outreach / application email from résumé + job description.
export async function writeOutreachEmail({ resumeText, file, jobText }) {
  const res = await fetch('/api/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resumeText, file, jobText }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Email API error ${res.status}`)
  return data
}

// Read a File as { name, base64 } for upload (PDF parsed server-side).
export function fileToPayload(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = String(reader.result).split(',')[1] || ''
      resolve({ name: file.name, base64 })
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
