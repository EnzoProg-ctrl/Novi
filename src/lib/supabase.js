import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error(
    'Missing Supabase environment variables. Copy .env.example to .env.local and fill in ' +
      'VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, then restart the dev server.',
  )
}

/**
 * Browser Supabase client.
 *
 * The publishable key is safe to ship to the browser: every table has row level
 * security enabled, so a signed-in student can only ever read or write their own
 * rows. Anything needing a service-role key (LLM calls, embedding generation)
 * must live in a Supabase Edge Function, never here.
 */
export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

export const STUDY_MATERIALS_BUCKET = 'study-materials'
