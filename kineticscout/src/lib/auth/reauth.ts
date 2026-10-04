import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { requireEnv } from '@/lib/env'

/**
 * Confirms the account password before a destructive action (account deletion). Uses a throwaway
 * client with no cookie storage, so the signed-in browser session is untouched; the temporary
 * session it creates is revoked immediately.
 */
export async function verifyPassword(email: string, password: string): Promise<boolean> {
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = requireEnv('Supabase Auth', ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY'])
  const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) return false
  await client.auth.signOut({ scope: 'local' })
  return true
}
