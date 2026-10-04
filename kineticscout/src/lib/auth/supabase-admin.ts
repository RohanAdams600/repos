import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { requireEnv } from '@/lib/env'

/**
 * Service-level Supabase client for administrative auth operations (deleting an auth user).
 * Bypasses RLS and must never be reachable from user input without an authorization check.
 */
function createSupabaseAdminClient() {
  const { SUPABASE_URL, SUPABASE_SECRET_KEY } = requireEnv('Supabase admin', ['SUPABASE_URL', 'SUPABASE_SECRET_KEY'])
  return createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

export async function deleteAuthUser(userId: string): Promise<void> {
  const { error } = await createSupabaseAdminClient().auth.admin.deleteUser(userId)
  if (error) throw new Error(`Failed to delete auth user: ${error.message}`)
}
