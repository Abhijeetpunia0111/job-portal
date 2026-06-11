import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Supabase is OPTIONAL. When env vars are absent the app runs in "live" mode,
// fetching jobs directly from the public ATS APIs in the browser.
export const isSupabaseEnabled = Boolean(url && anonKey)

export const supabase = isSupabaseEnabled ? createClient(url, anonKey) : null
