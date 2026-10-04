import { getPublishedPost } from '@/lib/content/posts'
import { shareImage, SHARE_IMAGE_SIZE } from '@/lib/share-image'

export const alt = 'KineticScout data report'
export const size = SHARE_IMAGE_SIZE
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const post = await getPublishedPost('DATA_REPORT', (await params).slug)
  return shareImage(post?.title ?? 'Data reports', 'Data report')
}
