'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createTRPCClient, httpBatchLink, TRPCClientError } from '@trpc/client'
import { createTRPCContext } from '@trpc/tanstack-react-query'
import { useState, type ReactNode } from 'react'
import superjson from 'superjson'
import type { AppRouter } from '@/server/routers/_app'

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>()

const REQUEST_TIMEOUT_MS = 20_000

/** 4xx errors are the caller's to fix; retrying them only repeats the failure. */
function isClientError(error: unknown): boolean {
  if (!(error instanceof TRPCClientError)) return false
  const status = (error.data as { httpStatus?: number } | undefined)?.httpStatus ?? 0
  return status >= 400 && status < 500
}

export function errorMessage(error: unknown): string {
  if (error instanceof TRPCClientError) return error.message
  if (error instanceof DOMException && error.name === 'TimeoutError') return 'The request took too long. Check your connection and try again.'
  return 'Something went wrong. Try again in a moment.'
}

export function TrpcProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => failureCount < 2 && !isClientError(error),
          },
          mutations: { retry: false },
        },
      }),
  )
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: '/api/trpc',
          transformer: superjson,
          maxURLLength: 2_000,
          fetch: (url, options) =>
            fetch(url, {
              ...options,
              credentials: 'same-origin',
              signal: options?.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]) : AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            }),
        }),
      ],
    }),
  )
  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  )
}
