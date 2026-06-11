// Per-domain cache of learned scraping adapters.
// Uses a Supabase `adapters` table when configured; otherwise a local JSON file.
// All DB calls degrade gracefully (missing table → treated as cache miss).
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const FILE = join(here, '.adapters.json')
const HAS_SUPABASE = Boolean(
  (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL) && process.env.SUPABASE_SERVICE_ROLE_KEY
)

let _admin
async function admin() {
  if (_admin === undefined) return _admin
  if (!_admin && HAS_SUPABASE) {
    try { ({ admin: _admin } = await import('./supabaseAdmin.js')) } catch { _admin = null }
  }
  return _admin
}

function readFileCache() {
  if (!existsSync(FILE)) return {}
  try { return JSON.parse(readFileSync(FILE, 'utf8')) } catch { return {} }
}

export async function getAdapter(domain) {
  if (HAS_SUPABASE) {
    try {
      const a = await admin()
      const { data } = await a.from('adapters').select('spec').eq('domain', domain).maybeSingle()
      return data?.spec || null
    } catch { return null }
  }
  return readFileCache()[domain] || null
}

export async function saveAdapter(domain, spec) {
  if (HAS_SUPABASE) {
    try {
      const a = await admin()
      await a.from('adapters').upsert({ domain, spec }, { onConflict: 'domain' })
      return
    } catch { /* fall through to file */ }
  }
  const all = readFileCache()
  all[domain] = spec
  try { writeFileSync(FILE, JSON.stringify(all, null, 2)) } catch { /* ignore */ }
}
