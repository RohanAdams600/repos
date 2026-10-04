<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# KineticScout working rules

- Authorization lives in `src/lib/auth/session.ts` and `src/lib/auth/permissions.ts`. Every page, Server Action, Route Handler and tRPC procedure checks it; never rely on `src/proxy.ts` alone.
- Run `npm run typecheck && npm run lint && npm run test:all` before committing. Integration tests need Postgres (see README).
- Brand rules are enforced in code review: no gradients, no glassmorphism, no em dashes in copy, no emoji in headings, no lucide icons (use `src/components/icons.tsx`), WCAG AAA contrast (tests/unit/contrast.test.ts).
- Never add marketing claims, statistics, testimonials or reviews that are not backed by real data.
