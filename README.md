# DoubtDesk (MVP)

Teacher starts a doubt session → gets a unique student link to share.
Students open the link and submit doubts. Each doubt is classified by the
**JEV AI decision model** (TypeSafe AI) so only genuine study doubts reach
the teacher — junk, off-topic, and abusive messages are auto-filtered.

## Run it

```bash
cd doubt-desk
npm install
npm start
```

Open http://localhost:3000

- Teacher home (`/`) — create a session, get the student link + dashboard link.
- Student page (`/s/CODE`) — submit a doubt, see solved Q&A.
- Teacher dashboard (`/t/TOKEN`) — live queues (Study / Needs review /
  Filtered / Solved), solve with an answer, override the AI.

## How the AI filter works

A doubt is judged by its **dominant purpose**, not by whether an academic word
appears somewhere in it. A genuine study question appended to social chat,
promotion, abuse, or a classifier override is `mixed` — it is never accepted
just because the study part is real.

### 1. Deterministic tripwire (runs first)

Before the model is trusted, `filter/` cleans and normalizes the message
(Unicode/zero-width removal, homoglyph and leetspeak folding) and scans
decoded views (base64, hex, percent-encoding, ROT13, reversed text). It
detects social/personal piggybacking, promotion and contact-seeking, abuse,
prompt injection, keyboard mashing, and bare greetings. Academic context
windows keep legitimate questions about Instagram, social media, cricket,
movies, gender, and similar topics from being misread as social chat.

Deterministic findings can **block acceptance**, but they can never accept a
doubt by themselves.

### 2. JEV classification

The cleaned message is sent to `POST https://api.typesafe.ai/v1/systemone`
(model `jev-1.13.0`) in exactly one round trip, with seven core questions
plus up to two scope questions:

| Question | Type | Purpose |
|---|---|---|
| `is_study` | `noul` | Is the whole message's main purpose a genuine study doubt? |
| `verdict` | `choice` | `study_doubt` / `mixed` / `off_topic` / `spam_or_junk` / `abusive` |
| `off_topic_part` | `noul` | Is there a substantial separate non-study part? |
| `abuse_signal` | `noul` | Abuse, threats, hate, or vulgar content aimed at someone |
| `spam_signal` | `noul` | Ads, promotion, solicitation, or contact-seeking |
| `manipulation_signal` | `noul` | Attempts to instruct, probe, or override the classifier |
| `asks_study_help` | `noul` | Is there an actual academic request, not just keywords? |
| `subject_fit` | `noul` | Only when subject scope applies — is it about this subject? |
| `chapter_fit` | `noul` | Only when chapter scope applies — is it about this chapter? |

The independent signals provide defense in depth: a high abuse/spam signal
can override a model that still says `study_doubt`, and a high
`off_topic_part` forces the mixed-message path.

The teacher picks a filter mode per session (changeable mid-session):

| Mode | Rule |
|---|---|
| **Subject only** | Accept only doubts about the session subject (study ≥ the effective threshold, verdict confident, subject fit ≥ 0.60) |
| **Strict chapter** | Accept only doubts about the named chapter (chapter fit ≥ 0.65); wrong-chapter is filtered |
| **All study doubts** | Accept any genuine study doubt; subject/chapter fit is shown but never flags |

### 3. Routing

1. Deterministic safety (abuse, promo, injection, encoded payloads, social
   piggybacking, gibberish) — flag or review, never accept.
2. If JEV is unavailable, the deterministic fallback runs — it never accepts;
   obvious junk is flagged and everything else is queued for review.
3. Independent model signals can flag or review a `study_doubt`.
4. A `mixed` verdict or a high `off_topic_part` is flagged/reviewed.
5. Only a clean `study_doubt`, with enough study probability, confidence, and
   margin, reaches the subject/chapter fit gate.
6. Fit decides acceptance for scoped sessions.

Borderline cases go to human review; only clear safety or dominant-purpose
violations are auto-flagged. No doubt is ever silently dropped. Each doubt
stores the full "why" (verdict, confidence, margin, fits,
off-topic/abuse/spam/manipulation signals, deterministic filter signals, and
the filter version). The dashboard shows it under each doubt's **AI filter
details** disclosure; the short status reason stays visible even when the
disclosure is hidden from **View → AI filter details**.

`STUDY_THRESHOLD` in `.env` is teacher-tunable but clamped to **0.70–0.95**.
The effective study gate is `max(0.70, STUDY_THRESHOLD)`.

## Notes / next steps

- Storage is **in-memory** — sessions vanish on restart. Add a DB (SQLite/Postgres) next.
- The teacher dashboard link is the only "auth" — treat it like a password.
- Tune `STUDY_THRESHOLD` in `.env` (higher = stricter; clamped to 0.70–0.95).
- Run `npm test` for the filter regression suite (no API key needed).
