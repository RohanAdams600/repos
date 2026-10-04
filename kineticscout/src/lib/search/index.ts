import 'server-only'
import { FAQS } from '@/lib/content/faq'
import { db } from '@/lib/db'
import { rankDocuments, SEARCH_LIMITS, tokenize, type SearchDocument, type SearchResult } from '@/lib/search/score'

const STATIC_PAGES: SearchDocument[] = [
  { href: '/', section: 'Page', title: 'KineticScout home', description: 'Log your measurables, see your class percentile and find programs that fit your numbers.', keywords: 'exit velocity pitch velocity 60 yard dash pop time recruiting' },
  { href: '/pricing', section: 'Page', title: 'Pricing', description: 'Scout is free forever. Pro Prospect adds video analysis, the College Matchmaker and unlimited logging.', keywords: 'price cost plan pro subscription free monthly yearly cancel' },
  { href: '/faq', section: 'Page', title: 'Frequently asked questions', description: 'Percentiles, privacy, video analysis accuracy, college matching and billing.', keywords: 'faq help questions' },
  { href: '/about', section: 'Page', title: 'About KineticScout', description: 'Who runs KineticScout and how to reach us.', keywords: 'company team address directions' },
  { href: '/contact', section: 'Page', title: 'Contact us', description: 'Email, phone and a contact form. We reply within 2 business days.', keywords: 'support help email phone message' },
  { href: '/blog', section: 'Page', title: 'Data reports', description: 'Weekly percentile reports built from anonymized KineticScout athlete data.', keywords: 'blog articles statistics averages' },
  { href: '/case-studies', section: 'Page', title: 'Case studies', description: 'How athletes and families have used KineticScout, published with their consent.', keywords: 'stories examples results' },
  { href: '/reviews', section: 'Page', title: 'Reviews', description: 'What KineticScout users say, published with their permission.', keywords: 'testimonials reviews ratings' },
  { href: '/legal/privacy', section: 'Legal', title: 'Privacy Policy', description: 'What we collect, why, who processes it, and your rights.', keywords: 'data deletion personal information children coppa' },
  { href: '/legal/terms', section: 'Legal', title: 'Terms of Service', description: 'The agreement for using KineticScout.', keywords: 'terms conditions rules' },
  { href: '/legal/refunds', section: 'Legal', title: 'Refund Policy', description: 'Refund windows, duplicate charges and cancellation.', keywords: 'refund money back cancel' },
  { href: '/legal/cookies', section: 'Legal', title: 'Cookie Policy', description: 'The cookies KineticScout sets and why.', keywords: 'cookies tracking analytics consent' },
  { href: '/sign-up', section: 'Page', title: 'Create your free profile', description: 'Sign up for a free KineticScout account.', keywords: 'register join account signup' },
]

const FAQ_DOCS: SearchDocument[] = FAQS.map((f) => ({
  href: `/faq#${f.id}`,
  section: 'FAQ',
  title: f.question,
  description: f.answer[0]!,
  keywords: f.answer.slice(1).join(' '),
}))

function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`)
}

/** Site search over pages, FAQs, and published articles and case studies. */
export async function siteSearch(query: string): Promise<SearchResult[]> {
  if (query.length < SEARCH_LIMITS.minLength) return []
  const tokens = tokenize(query).slice(0, 6)
  if (tokens.length === 0) return []

  // Every token must match title or description. Parameterised ILIKE with escaped wildcards.
  const posts = await db.blogPost.findMany({
    where: {
      status: 'PUBLISHED',
      AND: tokens.map((t) => ({
        OR: [{ title: { contains: escapeLike(t), mode: 'insensitive' as const } }, { metaDescription: { contains: escapeLike(t), mode: 'insensitive' as const } }],
      })),
    },
    orderBy: { publishedAt: 'desc' },
    take: 50,
    select: { slug: true, title: true, metaDescription: true, kind: true },
  })
  const postDocs: SearchDocument[] = posts.map((p) => ({
    href: p.kind === 'CASE_STUDY' ? `/case-studies/${p.slug}` : `/blog/${p.slug}`,
    section: p.kind === 'CASE_STUDY' ? 'Case study' : 'Data report',
    title: p.title,
    description: p.metaDescription,
  }))
  return rankDocuments([...STATIC_PAGES, ...FAQ_DOCS, ...postDocs], query)
}
