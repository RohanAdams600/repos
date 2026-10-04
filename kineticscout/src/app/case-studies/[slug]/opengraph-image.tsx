import { getPublishedPost } from '@/lib/content/posts'
import { shareImage, SHARE_IMAGE_SIZE } from '@/lib/share-image'

export const alt = 'KineticScout case study'
export const size = SHARE_IMAGE_SIZE
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const post = await getPublishedPost('CASE_STUDY', (await params).slug)
  return shareImage(post?.title ?? 'Case studies', 'Case study')
}
