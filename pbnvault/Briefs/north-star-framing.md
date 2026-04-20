# Aloomii Playbook: North Star Framing

**Last updated:** 2026-04-19
**Source:** app.aloomii.com build-out conversation

---

## What It Is

A $99 digital product combining a 70-page ebook, ElevenLabs audio narration, 7 infographics, 20 prompts, and a custom web portal at **app.aloomii.com**. Three editions (Founder, Solo, Operator) targeting different segments of Aloomii's ICP. Delivered via Gumroad checkout, gated access in a Next.js portal backed by PostgreSQL with Clerk auth.

---

## Why This, Why Now

The ebook is customer acquisition for a platform, not a standalone product. The real asset is the portal infrastructure — Clerk + PostgreSQL + Next.js on Cloudflare — which becomes the delivery layer for every future Aloomii digital product (Studio Membership, future playbook topics), every client deliverable, and eventually the proof point that "AI operations for relationship-driven businesses" is operated by AI, not just talked about.

A $99 ebook on Notion generates revenue once. A $99 ebook on Aloomii's own platform compounds across the entire product ladder.

---

## North Star Metric

**Weekly active buyers / total buyers at day 30 post-purchase.**

Target 40-50% for v1. Below 30% signals onboarding or value-matching problems. Above 60% means buyers are referring and upgrading.

---

## Why This Metric

Stickiness is the leading indicator of everything downstream — upsells to Studio Membership, referrals into The Table, word-of-mouth, review quality. A sticky portal with 40%+ WAU justifies every architectural choice (custom build over Notion, Clerk auth over file delivery, state management over static content). An unsticky portal means the thesis failed and we should have shipped PDFs.

---

## Stickiness Mechanism

Personal investment compounds. Buyers who favorite prompts, mark status, and write notes have made the portal partially theirs — recreating that state elsewhere costs more than returning. Three lightweight features carry the entire retention engine for v1:

- **Favorites** — bookmarking
- **Status tracking** — untried / tested / customized
- **Notes** — per-item personal notes

---

## Strategic Ladder

```
Free content
    → $99 Playbook (v1)
        → $29/mo Studio Membership (future)
            → $3,300/mo The Table
```

Each step uses the same portal infrastructure. Client managed backends eventually use the same PostgreSQL architecture (per-client projects). Every lesson from Playbook buyers informs the platform as a whole.

---

## Time Investment

~40-60 hours for v1 portal build (2-3 weeks focused, 5-6 weeks part-time). Infrastructure cost <$10/month at launch.

---

## One Sentence

**Aloomii is not building an ebook platform; it is building its platform layer, and the Playbook is its first product.**

---

## v2: Execution Environment (Future)

**When:** Months 3-6 post-v1 launch. Use v1 data to inform v2 design. Do not preempt v1 shipping.

**What:** Transform the portal from a prompt library into an execution environment. Buyers run prompts inside the portal, against their own AI accounts, and the portal remembers every run forever.

**Why 100x and not 10x:** Shifts the product category from "reference" to "tool," fundamentally changing where work happens. Weekly active ceilings move from 30-40% to 70-90% for adopted buyers.

**What it requires:** 150-250 hours of build time, BYOK economics, secure key storage, AI provider integration layer, run history schema, template variable system. Roughly 3-4 months of focused work.

**What it is worth:** Transforms Aloomii from "content company that ships digital products" to "platform company where buyers do their work." Unlocks Studio Membership tier, raises pricing power, creates genuine switching costs, validates the Aloomii thesis that AI operations is a category.

**One-sentence summary:** v2 is when Aloomii stops selling prompts and starts running them.
