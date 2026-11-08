# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Secondary-school and early-college teachers running live doubt sessions in class groups, and their students. Students write in English, Hindi, or Hinglish, often on a phone, often in a hurry. Teachers monitor the queue on a laptop or phone while teaching.

## Product Purpose

DoubtDesk gives a teacher one student link per session, accepts study doubts without login, and keeps the teacher's queue limited to genuine study questions. Success means the teacher spends their attention on real academic questions, while no message is silently lost: borderline cases stay recoverable in a review or filtered queue.

## Positioning

Filtering is by the message's dominant purpose, not by whether an academic keyword appears. A deterministic safety layer, a JEV classification pass, and a human review queue work together; a real study question appended to social chat, promotion, abuse, or a classifier override is never auto-accepted.

## Operating Context

A teacher creates a session, shares the student link in a class group or on the board, and watches a live dashboard. Students submit doubts anonymously or with a name and see solved answers on the same link. Sessions have a subject, an optional chapter, and one of three scopes: subject only, strict chapter, or all study doubts. The filter mode can change mid-session.

## Capabilities and Constraints

- Express app with in-memory session storage; sessions vanish on restart.
- No student or teacher login. The private teacher dashboard URL is the only access control.
- JEV (`jev-1.13.0`) provides study, verdict, off-topic, abuse, spam, manipulation, and asks-help signals. A deterministic fallback runs when JEV is unavailable and never auto-accepts.
- `STUDY_THRESHOLD` is teacher-tunable and clamped to 0.70–0.95.
- Messages are limited to 500 characters; names to 40.
- Existing API routes, status values (`accepted`, `review`, `flagged`, `solved`), filter signals, and keyboard shortcuts must keep working.

## Brand Commitments

The name is DoubtDesk. The voice is calm, direct, and classroom-native — no hype, no fake urgency, no surveillance theatre. The product speaks in plain English with Hinglish examples where useful.

## Evidence on Hand

The working Express app, its README, and the filter regression suite in `test/filter.test.js` are the only evidence. There are no customer logos, testimonials, benchmarks, or press claims, and none should be fabricated.

## Product Principles

1. The teacher's attention is the scarce resource; every queue decision should reduce noise without hiding it.
2. Nothing is silently deleted. Every filtered message is recoverable and explained.
3. Details are optional, not ambient. The queue stays calm; scores and signals are available on demand.
4. Students should feel invited to ask, not interrogated by the interface.
5. Language is not a barrier: Hinglish, Hindi, and English are first-class.

## Accessibility & Inclusion

Keyboard-first operation for search, solving, rejection, and settings. Visible focus states, reduced-motion support, semantic headings, and contrast that meets WCAG AA in both light and dark color schemes.
