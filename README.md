# Autonoma — Landing Page

Landing page for **Autonoma**, an AI automation service that builds AI agents to
handle repetitive operational work (email triage, data entry, reporting,
follow-ups) so teams can focus on higher-value work.

Static site — no build step, no dependencies. Just `index.html`, `styles.css`,
and `script.js`.

## Run locally

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Or open `index.html` directly in a browser.

## Deploy

Works as-is on any static host:

- **Netlify / Vercel**: drag-and-drop the folder, or connect the repo (no build command needed, output directory is `/`).
- **GitHub Pages**: enable Pages on this repo, serving from the root of this branch (or `main`).

## Wiring up the waitlist

The form in `script.js` is fully functional out of the box: submissions are
validated and stored in the visitor's browser (`localStorage`), and the
"people already on the list" counter updates live. That's enough to demo the
page, but signups won't go anywhere until you connect a real backend.

Open `script.js` and set `WAITLIST_ENDPOINT` to a POST endpoint that accepts
`{ "email": "..." }` as JSON. Easiest options:

1. **[Formspree](https://formspree.io)** (fastest): create a free form, copy
   the endpoint (`https://formspree.io/f/xxxxxxx`), paste it into
   `WAITLIST_ENDPOINT`. No code changes needed beyond that.
2. **[Getwaitlist](https://getwaitlist.com)** or similar waitlist-specific
   tools: same idea, swap in their submission endpoint.
3. **Your own backend**: a serverless function (Vercel/Netlify Functions,
   Supabase Edge Functions, Cloudflare Workers) that writes to a database and
   returns a 2xx response.

Once `WAITLIST_ENDPOINT` is set, real signups are sent there instead of the
local-only fallback.

## Structure

```
index.html    Page markup (hero, features, how it works, waitlist, FAQ)
styles.css    All styling (dark theme, gradients, responsive layout)
script.js     Form handling, validation, waitlist counter, scroll reveal
```

## Customizing

- **Copy**: edit directly in `index.html`.
- **Colors**: CSS variables at the top of `styles.css` (`--accent-1`, `--accent-2`, `--accent-3`).
- **Company name / branding**: search-and-replace "Autonoma" across `index.html` and update the favicon SVG if you rename it.
