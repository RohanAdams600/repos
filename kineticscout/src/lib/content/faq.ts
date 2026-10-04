import { PRO_PRICES } from '@/lib/billing/plans'

export type Faq = { id: string; question: string; answer: string[] }

/**
 * The five questions families ask most. Every statement here describes how the product actually
 * works; keep it in sync with the code it describes (noted in each entry).
 */
export const FAQS: readonly Faq[] = [
  {
    id: 'percentiles',
    question: 'How is my percentile calculated?',
    // src/lib/metrics/service.ts, worker/agents/seo/percentiles.ts
    answer: [
      'Every Sunday we rebuild the reference groups from KineticScout athletes. Each athlete counts once per metric, using their best value from the previous 12 months, so someone who logs every day does not outweigh someone who logs once.',
      'Your percentile compares your best value from the last 18 months with the athletes in your graduating class. A 75th percentile exit velocity means you are ahead of about 75% of your class on KineticScout. For timed events such as the 60-yard dash, a faster time ranks higher.',
      'Groups with fewer than 25 athletes are never shown, so no single athlete can be identified from a percentile. The comparison is with athletes on KineticScout, not every player in the country.',
    ],
  },
  {
    id: 'privacy',
    question: 'Who can see my profile and my numbers?',
    // src/lib/auth/permissions.ts, docs/COMPLIANCE.md
    answer: [
      'Profiles are private when you create them. Nothing is visible to coaches or the public until you choose to make your profile public.',
      'Athletes under 18 need a parent or guardian to approve by email before their profile can go public, before any message to a coach, and before a purchase. Children under 13 cannot create an account.',
      'We never sell personal information and do not share it for advertising. Aggregate statistics we publish always describe groups of at least 25 athletes.',
    ],
  },
  {
    id: 'video-analysis',
    question: 'How does the video analysis work, and how accurate is it?',
    // src/lib/biomechanics/kinematics.ts
    answer: [
      'You upload a short clip of one swing or pitch. Google Cloud Video Intelligence detects body landmarks in every frame, and our analysis measures when your hips, trunk, arm and hand each reach peak rotational speed. Efficient athletes fire in that order, each segment slightly after the one before.',
      'The report shows the order and spacing of those peaks, hip and shoulder separation when the front foot lands, and the sequencing problems they point to, with a skeleton drawn over your video.',
      'It works from a single 2D camera view, so treat speeds as estimates and use the report to compare your own clips over time. For the best results, film from directly in front of your chest at hip height, with your whole body in frame, in slow motion (120 or 240 frames per second). It is not medical advice or a replacement for a qualified coach.',
    ],
  },
  {
    id: 'matchmaker',
    question: 'Does the College Matchmaker tell me which schools will offer me?',
    // src/lib/matchmaker/score.ts
    answer: [
      "No. It compares your best numbers with each program's typical recent recruit, weighted for your position: pitch velocity for pitchers; exit velocity, arm strength and speed for position players.",
      'Programs are grouped as a strong fit, a realistic target, a reach or a long shot, and the fit score is highest where your numbers sit at or slightly above the typical recruit. If your GPA is below a program’s listed minimum, that program is shown as a reach at best.',
      'Coaches weigh many things we cannot measure, from game performance to character, so use the matches to decide where to focus your outreach, not as a prediction.',
    ],
  },
  {
    id: 'billing',
    question: 'How do billing, cancellation and refunds work?',
    // src/lib/billing/*, /legal/refunds
    answer: [
      `Scout is free forever and includes 3 metric entries a month. Pro Prospect costs ${PRO_PRICES.monthly.label} or ${PRO_PRICES.yearly.label}, and the price on the pricing page is exactly what you are charged.`,
      'You can cancel any time from your billing page in one step, with no cancellation fee. Pro stays active until the end of the period you paid for.',
      'If Pro is not for you, email us within 14 days of your first payment, or of a yearly renewal, for a full refund. If two subscriptions are ever started on one account, the extra one is cancelled and refunded automatically. Athletes under 18 need a parent or guardian to approve and complete the purchase.',
    ],
  },
]

export function faqJsonLd(faqs: readonly Faq[] = FAQS): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer.join(' ') },
    })),
  }
}
