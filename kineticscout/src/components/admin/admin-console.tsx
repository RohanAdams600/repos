'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/ui/copy-button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Spinner } from '@/components/ui/spinner'
import { errorMessage, useTRPC } from '@/trpc/client'

type AssetStatus = 'DRAFT' | 'APPROVED' | 'PUBLISHED' | 'REJECTED' | 'FAILED'
type Issue = { code: string; severity: 'block' | 'warn'; message: string }

function MarketingQueue() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<AssetStatus>('DRAFT')
  const [page, setPage] = useState(1)
  const query = useQuery(trpc.admin.marketingAssets.queryOptions({ status, page }))
  const review = useMutation(
    trpc.admin.reviewMarketingAsset.mutationOptions({ onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.admin.marketingAssets.queryKey() }) }),
  )

  return (
    <section aria-labelledby="marketing-title" className="flex flex-col gap-4">
      <h2 id="marketing-title" className="text-2xl font-bold">
        Growth agent output
      </h2>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {(['DRAFT', 'APPROVED', 'PUBLISHED', 'REJECTED', 'FAILED'] as const).map((s) => (
          <Button key={s} size="sm" variant={s === status ? 'primary' : 'secondary'} aria-pressed={s === status} onClick={() => { setStatus(s); setPage(1) }}>
            {s.charAt(0) + s.slice(1).toLowerCase()}
          </Button>
        ))}
      </div>
      {review.isError && <Alert tone="error">{errorMessage(review.error)}</Alert>}
      {query.isPending && <Spinner label="Loading assets" />}
      {query.isError && <Alert tone="error">{errorMessage(query.error)}</Alert>}
      {query.data?.items.length === 0 && <EmptyState title="Nothing here">No assets with this status.</EmptyState>}
      <ul className="flex flex-col gap-4">
        {query.data?.items.map((asset) => {
          const issues = asset.complianceIssues as Issue[]
          const json = JSON.stringify(asset.payload, null, 2)
          return (
            <li key={asset.id} className="flex flex-col gap-3 border-2 border-border-subtle p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <p className="font-bold">
                  {asset.channel.replace('_', ' ')}: {asset.topic}
                </p>
                <p className="tabular text-sm text-fg-muted">{new Date(asset.createdAt).toLocaleString()}</p>
              </div>
              {issues.length > 0 && (
                <ul className="flex flex-col gap-1 text-sm">
                  {issues.map((issue, i) => (
                    <li key={`${issue.code}-${i}`}>
                      <span className="font-bold">{issue.severity === 'block' ? 'Blocked' : 'Review'}:</span> {issue.message}
                    </li>
                  ))}
                </ul>
              )}
              <pre className="tabular max-h-64 overflow-auto bg-surface p-3 text-sm whitespace-pre-wrap">{json}</pre>
              <div className="flex flex-wrap gap-3">
                <CopyButton value={json} label="Copy JSON" />
                {(asset.status === 'DRAFT' || asset.status === 'APPROVED') && (
                  <>
                    {asset.status === 'DRAFT' && (
                      <ConfirmDialog
                        trigger={<Button size="sm">Approve</Button>}
                        title="Approve this asset?"
                        description="Approved Meta ads are pushed by the next growth run only when META_AUTOPUBLISH is on, and are created paused unless auto-activation is enabled."
                        confirmLabel="Approve"
                        onConfirm={() => review.mutate({ id: asset.id, decision: 'APPROVED' })}
                      />
                    )}
                    <ConfirmDialog
                      trigger={<Button size="sm" variant="danger">Reject</Button>}
                      title="Reject this asset?"
                      description="It will be kept for the audit trail but never published."
                      confirmLabel="Reject"
                      tone="danger"
                      onConfirm={() => review.mutate({ id: asset.id, decision: 'REJECTED' })}
                    />
                  </>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      {query.data && query.data.pageCount > 1 && (
        <nav aria-label="Asset pages" className="flex items-center gap-4">
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="tabular text-sm">Page {query.data.page} of {query.data.pageCount}</span>
          <Button size="sm" variant="secondary" disabled={page >= query.data.pageCount} onClick={() => setPage(page + 1)}>Next</Button>
        </nav>
      )}
    </section>
  )
}

function BlogDrafts() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const query = useQuery(trpc.admin.blogDrafts.queryOptions())
  const review = useMutation(trpc.admin.reviewBlogPost.mutationOptions({ onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.admin.blogDrafts.queryKey() }) }))
  return (
    <section aria-labelledby="blog-title" className="flex flex-col gap-4">
      <h2 id="blog-title" className="text-2xl font-bold">
        Data report drafts
      </h2>
      {review.isError && <Alert tone="error">{errorMessage(review.error)}</Alert>}
      {query.isPending && <Spinner label="Loading drafts" />}
      {query.isError && <Alert tone="error">{errorMessage(query.error)}</Alert>}
      {query.data?.length === 0 && <EmptyState title="No drafts">Drafts appear here when an article fails the automatic fact check or auto-publishing is off.</EmptyState>}
      <ul className="flex flex-col gap-4">
        {query.data?.map((post) => {
          const report = post.validationReport as { unknownNumbers?: string[]; bannedPhrases?: string[] } | null
          return (
            <li key={post.id} className="flex flex-col gap-3 border-2 border-border-subtle p-4">
              <p className="text-lg font-bold">{post.title}</p>
              <p className="text-fg-muted">{post.metaDescription}</p>
              {report?.unknownNumbers?.length ? <p className="text-sm"><span className="font-bold">Unverified numbers:</span> {report.unknownNumbers.join(', ')}</p> : null}
              {report?.bannedPhrases?.length ? <p className="text-sm"><span className="font-bold">Policy issues:</span> {report.bannedPhrases.join(', ')}</p> : null}
              <details>
                <summary className="cursor-pointer font-bold">Read draft</summary>
                <pre className="mt-2 max-h-96 overflow-auto bg-surface p-3 text-sm whitespace-pre-wrap">{post.bodyMarkdown}</pre>
              </details>
              <div className="flex flex-wrap gap-3">
                <ConfirmDialog trigger={<Button size="sm">Publish</Button>} title="Publish this article?" description="It becomes public on the blog immediately." confirmLabel="Publish" onConfirm={() => review.mutate({ id: post.id, decision: 'PUBLISHED' })} />
                <ConfirmDialog trigger={<Button size="sm" variant="danger">Reject</Button>} title="Reject this draft?" description="It will not be published." confirmLabel="Reject" tone="danger" onConfirm={() => review.mutate({ id: post.id, decision: 'REJECTED' })} />
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export function AdminConsole() {
  return (
    <div className="flex flex-col gap-12">
      <MarketingQueue />
      <BlogDrafts />
    </div>
  )
}
