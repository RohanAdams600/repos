import ReactMarkdown from 'react-markdown'

/** Markdown renderer for articles and case studies. Raw HTML is skipped, external links and images are dropped. */
export function ArticleBody({ markdown }: { markdown: string }) {
  return (
    <div className="flex flex-col gap-4 leading-relaxed [&_h2]:mt-6 [&_h2]:text-2xl [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_p]:text-fg-muted">
      <ReactMarkdown
        skipHtml
        components={{
          a: ({ href, children }) => (href?.startsWith('/') ? <a href={href}>{children}</a> : <span>{children}</span>),
          img: () => null,
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}
