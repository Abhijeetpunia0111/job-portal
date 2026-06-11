import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error(
    '\n  Missing Supabase credentials.\n' +
      '  Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env before running the crawler.\n'
  )
  process.exit(1)
}

// Service-role client — bypasses RLS for server-side writes. Never ship to the browser.
export const admin = createClient(url, serviceKey, {
  auth: { persistSession: false },
})
