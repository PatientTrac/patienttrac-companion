import { createClient } from '@supabase/supabase-js'
import { pickAuthStorage } from './auth/loginPrefs'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(url, anon, {
  auth: { persistSession: true, autoRefreshToken: true, storage: pickAuthStorage() },
})

// cr schema is not the default PostgREST schema — always go through .schema('cr')
export const cr = () => supabase.schema('cr')
