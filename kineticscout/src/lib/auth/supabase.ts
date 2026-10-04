import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { hardenCookieOptions, isSecureCookieEnvironment } from '@/lib/auth/cookies'
import { env, requireEnv } from '@/lib/env'

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Create one per request; never share a client between requests.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = requireEnv('Supabase Auth', ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY'])
  const secure = isSecureCookieEnvironment(env().APP_URL)

  return createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { flowType: 'pkce', autoRefreshToken: false, detectSessionInUrl: false },
    cookieOptions: hardenCookieOptions({}, secure),
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, hardenCookieOptions(options, secure))
          }
        } catch {
          // Server Components cannot write cookies. The proxy refreshes sessions on every
          // request, so a token refresh attempted during render is safe to drop here.
        }
      },
    },
  })
}
