/** Pure coach rules, shared by forms and the server. */

export const CONTACT_POLICY = {
  /** Requests a coach may send per day. */
  perDay: 20,
  /** Unanswered requests expire after this many days. */
  expiresDays: 30,
  /** After a decline, the same coach cannot ask the same athlete again for this long. */
  cooldownDaysAfterDecline: 90,
  messageMax: 1000,
} as const

const URL_PATTERN = /(https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(com|net|org|io|co|us|edu|gov)\b/i
const PHONE_PATTERN = /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/

/**
 * School email check: a .edu address, or the domain the program itself uses for its head coach.
 * Free mail providers never qualify.
 */
export function workEmailAllowed(email: string, programCoachEmail: string | null): boolean {
  const domain = email.trim().toLowerCase().split('@')[1]
  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return false
  if (domain.endsWith('.edu')) return true
  const programDomain = programCoachEmail?.trim().toLowerCase().split('@')[1]
  return Boolean(programDomain && (domain === programDomain || domain.endsWith(`.${programDomain}`)))
}

/**
 * First messages stay on the platform: no links and no phone numbers, which keeps phishing and
 * off-platform pressure away from teens. Once a request is accepted, the coach has an email address.
 */
export function contactMessageProblem(message: string): string | null {
  const trimmed = message.trim()
  if (trimmed.length < 20) return 'Write at least a couple of sentences about why you are reaching out.'
  if (trimmed.length > CONTACT_POLICY.messageMax) return `Keep the message under ${CONTACT_POLICY.messageMax} characters.`
  if (URL_PATTERN.test(trimmed)) return 'Leave links out of the first message. Once the athlete accepts, you can email them directly.'
  if (PHONE_PATTERN.test(trimmed)) return 'Leave phone numbers out of the first message. Once the athlete accepts, you can email them directly.'
  return null
}
