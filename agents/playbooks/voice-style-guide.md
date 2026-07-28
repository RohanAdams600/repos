# Voice & Style Guide — reverse-engineered playbook

This is the kind of artifact `E — Equip with Context and Tools` calls for:
a style guide extracted from real operating patterns, not invented from
scratch. In a live deployment this file is regenerated periodically by
Scout (the research agent) analyzing a corpus of the founder's actual
sent emails, call transcripts, and approved client deliverables, then
reviewed by a human before being promoted into this file. The extraction
job lives at `src/lib/memory.ts:extractStyleGuide()`.

## Extraction inputs (what Scout reads to build this file)

1. Last 90 days of founder-sent client emails (subject + body).
2. Approved (not draft) onboarding sequences.
3. Call transcripts flagged `won` in the CRM.
4. Any doc explicitly tagged `voice-reference` by the founder.

## Extracted patterns (example — regenerate against real data before use)

- **Sign-off:** "— [Founder First Name]" only. No "Best," no "Regards," no
  signature block on internal-feeling emails; full signature block only on
  first-touch outbound.
- **Subject lines:** lowercase, no punctuation, 3–6 words
  ("re: your agent build", "next step on this").
- **Sentence length:** median 12 words. Agents drafting client copy should
  flag and shorten any sentence over 25 words.
- **Numbers:** always digits, never spelled out ("3 agents" not "three
  agents"), except at the start of a sentence.
- **Objection handling pattern observed in won calls:** acknowledge in one
  clause, pivot to a specific proof point, end with a low-friction next
  step. Never a paragraph of persuasion.
- **What never appears:** "synergy," "leverage" as a verb, "revolutionary,"
  "game-changing," exclamation points in body copy.

## How agents use this file

- Wordsmith loads this file into every content-generation system prompt.
- Warden checks drafts against this file's rules as part of its QA pass
  and rejects (does not silently fix) anything that violates the sign-off
  or banned-word rules — those are founder-identity issues, not typos.
