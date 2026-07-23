---
doc_id: NOTICE-2026-012
doc_type: privacy-notice
project: kms-spark
status: draft
owner: levi
last_verified: 2026-07-23
related: [docs/trd-graph-tracking.md, docs/prd-graph-tracking.md]
---

# SPARK — usage measurement notice (DRAFT)

> **Draft for IT/HR + Levi to review before circulating.** It states what the
> app measures, grounded in how the feature is actually built. The legal-basis
> and contact lines are marked `[OPEN]` for IT/HR to complete — do not publish
> with those unfilled.

## Why this exists

SPARK now measures **how the app itself is used** — which pages get opened and
which buttons get clicked — so we can see whether features are useful and decide
what to improve. This is measurement of the **product**, not of people.

## What is collected

- **Page views** — which page was opened (grouped, e.g. "an initiative page",
  never *which* initiative or *who* opened it).
- **Clicks** — only on a small set of buttons we explicitly tag for counting
  (e.g. "Create initiative", a nav link). Each records the button and where on
  the screen it was clicked.

## What is NOT collected

- **No names, emails, IP addresses, or device details.** Your identity is stored
  only as a one-way pseudonymous code, from which your name cannot be recovered.
- **No keystrokes, no form contents, no text you type, no mouse trails.**
- **No screen recording or session replay.**

## How it's used, and by whom

- The platform owner sees **aggregate** numbers (most-used pages, click totals,
  usage over time) to guide product decisions.
- You can see **your own** access frequency. **No one can view another named
  person's activity** — the app has no screen for that; it's enforced in the
  code, not just as a policy.
- This data is **not** used to evaluate individual performance, attendance, or
  productivity.

## How long it's kept

- **Raw events are deleted after 90 days.** Only aggregate daily counts (with no
  personal identifier) are kept longer, for trends.

## Your questions / rights

- `[OPEN — legal basis for processing, e.g. legitimate interest: IT/HR to state]`
- `[OPEN — who to contact with questions / how to raise a concern: IT/HR to name]`
- `[OPEN — jurisdiction-specific rights, if any: IT/HR to confirm]`

## The short version

We count clicks and page opens to improve the tool. We don't know it's *you* —
just that *someone* used a feature. We never watch individuals, we keep raw data
only 90 days, and we never collect what you type.
