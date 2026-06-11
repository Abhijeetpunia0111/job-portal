// One-off: apply schema.sql + migrations to the database in DATABASE_URL.
// Idempotent — safe to re-run. Fixes missing tables / RLS policies.
//   node crawler/apply-schema.js
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import pg from 'pg'

const here = dirname(fileURLToPath(import.meta.url))
const conn = process.env.DATABASE_URL
if (!conn) {
  console.error('\n  DATABASE_URL not set in .env\n')
  process.exit(1)
}

const files = ['../supabase/schema.sql', '../supabase/enrichment.sql', '../supabase/linkedin.sql']

const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } })

try {
  await client.connect()
  console.log('Connected to database.')
  for (const f of files) {
    const sql = readFileSync(join(here, f), 'utf8')
    await client.query(sql)
    console.log(`  ✓ applied ${f.replace('../supabase/', '')}`)
  }
  const { rows } = await client.query(
    `select tablename, rowsecurity from pg_tables where schemaname='public' and tablename in ('jobs','companies','linkedin_queue')`
  )
  const { rows: pol } = await client.query(
    `select tablename, policyname from pg_policies where schemaname='public' order by tablename`
  )
  console.log('\nTables:', rows.map((r) => `${r.tablename}(rls=${r.rowsecurity})`).join(', '))
  console.log('Policies:', pol.map((p) => `${p.tablename}:${p.policyname}`).join(', '))
  console.log('\nDone.\n')
} catch (e) {
  console.error('\n  Could not apply schema:', e.message)
  console.error('  (If this is a network/IPv6 issue, run supabase/schema.sql in the Supabase SQL editor instead.)\n')
  process.exitCode = 1
} finally {
  await client.end()
}
