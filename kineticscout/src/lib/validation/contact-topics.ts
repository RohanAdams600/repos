/** Contact topics, shared with the client form. Kept free of zod so client bundles stay CSP-clean. */
export const CONTACT_TOPICS = [
  { value: 'support', label: 'Account or product help' },
  { value: 'billing', label: 'Billing or refunds' },
  { value: 'privacy', label: 'Privacy or data deletion request' },
  { value: 'coach', label: 'College coach or program' },
  { value: 'other', label: 'Something else' },
] as const
