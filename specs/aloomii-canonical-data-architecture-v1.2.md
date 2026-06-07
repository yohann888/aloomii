---
title: Aloomii Canonical Data Architecture
version: "1.2"
status: "Foundation, CRM-completeness revision"
author: "Jenny Holland, Co-Founder, Aloomii"
date: "May 2026"
audience: "Engineering, Architecture, Future-Self"
---

# Aloomii Canonical Data Architecture

> **Engineering Architecture** — The foundational data architecture for Aloomii's AI operations platform. Defines the canonical entity model, provenance and outcome plumbing, and tenant isolation strategy that supports the chamber engagement at CRCC and scales to membership organizations across verticals.
>
> **Document v1.2** · Status: Foundation, CRM-completeness revision · Author: Jenny Holland, Co-Founder, Aloomii · Date: May 2026 · Audience: Engineering, Architecture, Future-Self

**Executive Summary**

This document defines the canonical data architecture for Aloomii's AI operations platform. It is the foundation document for every customer engagement Aloomii will undertake, starting with the Caledonia Regional Chamber of Commerce (CRCC) in 2026 and extending across membership organizations in adjacent verticals through 2028 and beyond.

The architecture is designed around a specific strategic thesis: Aloomii's durable competitive moat will not live in agent fleets, prompts, or LLM choices. Those rotate. The moat lives in the data layer, in the structured accumulation of relationship intelligence, decision provenance, and outcome attribution across customers and over time. Three decisions made in this document, if executed with discipline, will compound into a moat that is structurally difficult to replicate. Three decisions made carelessly will produce a services business that ages into commoditization.

The three decisions are: the canonical entity model, the provenance and outcome plumbing that travels with every record, and the tenant isolation strategy that allows cross-customer learning without cross-customer leakage. Each is documented in detail below. Each must be implemented before CRCC's production data lands, because retrofitting any of them is enormously expensive.

**The four moats this architecture enables**

  - **Moat 1:** Cross-customer signal graph. Anonymized, aggregated patterns across all Aloomii customers feed back into per-customer recommendations. Competitors entering the market in 2027 will have brilliant prompts but no outcome data. Aloomii will have years of structured interaction-outcome chains.

  - **Moat 2:** Structured organizational memory with provenance. Decisions, reasoning, alternatives, and outcomes captured as first-class entities. Customers cannot leave without losing accumulated institutional intelligence they paid years to build.

  - **Moat 3:** Interaction-outcome learning loop. Every AI-generated artifact traces forward to outcomes and backward to inputs. The system gets measurably smarter over time in ways a competitor cannot reproduce from a cold start.

  - **Moat 4:** Multi-tenant context isolation with cross-tenant learning. Structural privacy guarantees that allow Aloomii to credibly serve sensitive verticals while still benefiting from aggregate pattern learning.

> Reading this document. If you are an engineer about to write code against this schema, read Sections 3 through 5 carefully and refer to Section 6 (Reasoning) when you need to understand why a choice was made. If you are a future contributor wondering why the schema is shaped this way, start with Section 6.

## Contents

- 1. Strategic context

- 2. Architectural principles

- 3. Canonical entity model

  - 3.1 Party and Membership

  - 3.2 Interaction

  - 3.3 Signal

  - 3.4 Decision

  - 3.5 Outcome

  - 3.6 Generated Artifact (seventh entity)

  - 3.7 Supporting tables

  - 3.8 Entity relationship summary

  - 3.9 Task (added in v1.2)

  - 3.10 Opportunity / Deal as first-class entity (documented gap)

- 4. Provenance and outcome plumbing

  - 4.1 Universal metadata header

  - 4.2 Generated artifact schema (detail)

  - 4.3 Outcome attribution rules

  - 4.4 Audit trail design

- 5. Tenant isolation architecture

  - 5.1 Threat model

  - 5.2 Chosen strategy: schema-per-tenant

  - 5.3 Cross-tenant learning pipeline

  - 5.4 Migration and export procedures

- 6. Reasoning and rejected alternatives

- 7. Implementation roadmap

- 8. Open questions

- 9. Change log

# 1. Strategic context

Aloomii is a team of forward-deployed engineers building AI operations systems for relationship-driven membership organizations. Most CRMs and association management systems on the market today are mature, commoditized, and uninteresting from an engineering standpoint. They are not where the next decade of value will be created in this space.

What is uncommoditized, and where Aloomii's opportunity sits, is the AI operations layer that runs on top of membership data. Predictive churn modeling that actually works. Content engines that draft from real signals rather than generic prompts. Institutional memory that survives staff turnover. Outcome attribution that lets the system measurably improve over time. None of these exist in current AMS offerings. All of them depend critically on the data architecture beneath.

The chamber engagement at CRCC is the first deployment of this thesis. Chambers \#2 through \#5 will validate that the pattern travels across the chamber vertical. By chamber \#5, the architecture should have produced something close to a productized solution that an internal operator can configure and deploy without bespoke engineering work per customer. From there, vertical expansion to professional associations, real estate boards, trade groups, and adjacent membership organizations becomes a question of vertical adaptation rather than re-architecting.

The architecture in this document is designed for that arc. Every choice is made with the question "how does this look at customer \#25?" in mind, not just "how does this look at CRCC?" That discipline is the difference between a schema that scales and a schema that becomes the bottleneck.

**Scope and non-scope**

This document covers:

  - The canonical entity model. The five core entities (Party, Interaction, Signal, Decision, Outcome) plus Generated Artifact and supporting tables.

  - Universal metadata fields that travel with every record.

  - Outcome attribution rules and audit trail design.

  - Tenant isolation strategy, including cross-tenant learning pipeline architecture.

  - Reasoning for each major decision and what alternatives were rejected and why.

This document does not cover:

  - Specific Postgres dialect details, indexing strategies, or query patterns. Those live in implementation guides.

  - Application-layer code, API design, or front-end concerns. Those are downstream of this architecture.

  - Specific agent prompts, model choices, or fleet configuration. Those rotate. This architecture survives them.

  - Pricing, contracts, or commercial structure.

# 2. Architectural principles

Seven principles inform every decision in this document. When in doubt, return to these. They are listed in priority order. When principles conflict, the higher-listed one wins.

## 2.1 Tenant data isolation is non-negotiable

No customer's data ever appears in another customer's context, prompt, query result, or recommendation. Ever. This is a structural guarantee enforced at the database level, not a policy enforced at the application level. When this principle conflicts with engineering convenience, isolation wins.

## 2.2 Provenance travels with every record

Every row in every table can answer the questions: Who or what created this? When? Based on what evidence? With what confidence? If a record cannot answer these questions, it has no place in the schema. Provenance is added at write time, never retrofitted.

## 2.3 Decisions and reasoning are first-class

The reasoning behind a decision is as important as the decision itself, and is captured in structured form at decision time. "Notes" fields and "comments" columns do not count. The structured capture of reasoning is what allows institutional memory to survive staff turnover, and is the central mechanism of Moat 2.

## 2.4 Events are immutable; state is derived

Critical entities (Party, Membership, Decision) are modeled as append-only event streams. Current state is a materialized view derived from the event log. This is event sourcing, applied selectively. Operational entities (signals about to expire, drafts in progress) can be mutable, but anything that contributes to institutional memory must be append-only.

## 2.5 Polymorphism through metadata, not through schema explosion

Vertical-specific surface fields (real estate license types, chamber tier names, association credential codes) live in JSONB metadata blocks. The canonical schema does not grow new tables or columns for every vertical. This keeps the schema teachable, queryable, and stable as Aloomii expands across verticals.

## 2.6 Every generated artifact is traceable end-to-end

An AI-generated email, content piece, or recommendation must be traceable forward to its outcome and backward to its inputs (prompt template, model, source records, prior context). Without this end-to-end traceability, the learning loop (Moat 3) cannot function.

## 2.7 Cross-tenant learning is opt-in and aggregate-only

Pattern learning that benefits all customers is valuable and necessary. It is also dangerous if executed carelessly. Cross-tenant insights are derived only from k-anonymous aggregated data through a one-way pipeline. Per-tenant systems never read from the patterns layer except through derived outputs.

> These principles are not aspirations. They are tested at every code review and architectural decision. A change that violates a higher-priority principle in favor of a lower-priority one is rejected by default. The principles exist precisely so the team does not relitigate the same tradeoffs every quarter.

# 3. Canonical entity model

Aloomii's data model is built around six canonical relationship entities, Generated Artifact as a seventh supporting entity for AI provenance, Task as an eighth supporting entity for forward-looking work, along with several other supporting tables. The eight core entities are: Party, Membership, Interaction, Signal, Decision, Outcome, Generated Artifact, and Task. Together they represent the core conceptual structure of any relationship-driven organization, whether membership-based or sales-driven, regardless of vertical.

The model is designed to absorb vertical differences through metadata blocks rather than through schema changes. A chamber, a real estate board, a professional association, an account-based sales team, and an advisory firm all map to the same eight entities. What differs is the vocabulary used at the application surface and the metadata fields populated within each entity. The underlying structure is invariant.

**Vertical mapping at a glance**

|                 |                                   |                                   |                                    |
| --------------- | --------------------------------- | --------------------------------- | ---------------------------------- |
| **Entity**      | **Chamber (CRCC)**                | **Real Estate Board**             | **Professional Association**       |
| **Party**       | Member business + contact persons | Brokerage + licensed agents       | Member individual + employer       |
| **Membership**  | Annual chamber dues contract      | MLS access + dues contract        | Annual professional membership     |
| **Interaction** | Event attendance, email reply     | MLS query, training attended      | CE credit earned, mentor meeting   |
| **Signal**      | Renewal churn risk                | License expiration risk           | Lapsed CE compliance risk          |
| **Decision**    | Renew sponsor at premier tier     | Suspend access for non-compliance | Grant fellowship designation       |
| **Outcome**     | Sponsor revenue booked            | Access revoked / restored         | Designation conferred              |
| **Task**        | Send renewal letter by Friday     | Schedule license review call      | Draft fellowship orientation email |

If a new vertical onboards in 2027, such as a credit union member organization, alumni association, or faith community, the same eight entities apply. The mapping exercise is the first step of every new vertical engagement and produces only the metadata schema, not new tables.

## 3.1 Party and Membership

**What it is**

Party is the canonical legal entity, either an Individual or an Organization, that exists in the system. Parties are largely immortal; a person or company does not cease to exist when they leave a membership organization. Membership is the contractual container that ties a Party to a tenant for a specific period under specific terms. State\_Event is the append-only ledger that records every lifecycle transition of a Membership.

The three-way decomposition is the central architectural insight of this document. It is the difference between a CRM that ages well and one that becomes unmanageable by year three. Most chamber and association systems collapse all three concepts into a single "Member" table with a mutable status field. This works for the first six months and creates problems for the next ten years.

**What it isn't**

Party is not a contact record. Contacts are relationships between Parties (an individual works at an organization, an agent represents a brokerage). Membership is not a person; it is a contract. State\_Event is not a status update; it is a permanent historical fact.

**Lifecycle**

A Party rarely changes. It is created when first encountered and persists indefinitely. A Membership transitions through states (Prospect → Applicant → Active → Lapsed → Reinstated → Terminated) by appending State\_Events. The current state is materialized from the most recent event, but the full history is always reconstructable.

**Schema: Party**

|                       |             |         |                                                                   |
| --------------------- | ----------- | ------- | ----------------------------------------------------------------- |
| **Field**             | **Type**    | **Req** | **Notes**                                                         |
| id                    | UUID        | yes     | Primary key. Use uuid\_generate\_v7() for time-ordered UUIDs.     |
| tenant\_id            | UUID        | yes     | Foreign key to tenant. Required on every row for isolation.       |
| party\_type           | ENUM        | yes     | INDIVIDUAL or ORGANIZATION. Drives polymorphic logic.             |
| canonical\_name       | TEXT        | yes     | Display name. "Acme Corp" or "Jane Doe".                          |
| canonical\_email      | TEXT        | no      | Primary email for individuals. Null for orgs unless contact-less. |
| external\_identifiers | JSONB       | no      | Vertical-specific IDs. {"mls\_id": "12345", "crm\_id": "abc"}.    |
| metadata              | JSONB       | no      | Vertical-specific surface fields. License type, tax code, etc.    |
| created\_at           | TIMESTAMPTZ | yes     | Standard provenance header (see Section 4.1).                     |
| created\_by           | UUID/STRING | yes     | Standard provenance header.                                       |
| updated\_at           | TIMESTAMPTZ | no      | Null until first update. Standard provenance header.              |
| source                | TEXT        | yes     | Where this record originated. Manual, import, agent, API.         |
| version               | INTEGER     | yes     | Increments on update. Supports optimistic concurrency.            |

**Schema: Membership**

|                        |             |         |                                                                        |
| ---------------------- | ----------- | ------- | ---------------------------------------------------------------------- |
| **Field**              | **Type**    | **Req** | **Notes**                                                              |
| id                     | UUID        | yes     | Primary key.                                                           |
| tenant\_id             | UUID        | yes     | Denormalized for query performance and isolation enforcement.          |
| party\_id              | UUID        | yes     | Foreign key to Party. The party who holds this membership.             |
| membership\_type       | TEXT        | yes     | Standard, premier, sponsor, etc. Vertical-defined enum stored as text. |
| tier                   | TEXT        | yes     | Tier within type. Drives pricing, benefits, reporting. Required field. |
| effective\_start       | TIMESTAMPTZ | yes     | When this membership began.                                            |
| effective\_end         | TIMESTAMPTZ | no      | When this membership ends or ended. Null for open-ended.               |
| current\_status\_cache | TEXT        | yes     | Materialized from latest State\_Event. ACTIVE, LAPSED, etc.            |
| metadata               | JSONB       | no      | Contract terms, dues amount, special conditions.                       |
| (provenance fields)    | \-          | yes     | Standard provenance header applies. See Section 4.1.                   |

**Schema: State\_Event**

|                          |             |         |                                                                         |
| ------------------------ | ----------- | ------- | ----------------------------------------------------------------------- |
| **Field**                | **Type**    | **Req** | **Notes**                                                               |
| id                       | UUID        | yes     | Primary key.                                                            |
| tenant\_id               | UUID        | yes     | Denormalized for isolation.                                             |
| membership\_id           | UUID        | yes     | Foreign key to Membership.                                              |
| from\_state              | TEXT        | no      | Previous state. Null for initial state.                                 |
| to\_state                | TEXT        | yes     | New state. PROSPECT, APPLICANT, ACTIVE, LAPSED, REINSTATED, TERMINATED. |
| transition\_reason       | TEXT        | yes     | Why this transition occurred. Required, not optional.                   |
| effective\_at            | TIMESTAMPTZ | yes     | When the transition takes effect (may differ from created\_at).         |
| caused\_by\_decision\_id | UUID        | no      | Foreign key to Decision if this transition was the result of one.       |
| metadata                 | JSONB       | no      | Additional context. Renewal terms, lapse reason details, etc.           |
| (provenance fields)      | \-          | yes     | Standard provenance header applies.                                     |

**Schema: Party\_Relationship**

Parties relate to other Parties. An individual works at an organization. A brokerage employs agents. A parent company owns a subsidiary. A contact person represents a member organization. These relationships have time bounds (employment ends, representation transfers) and must be queryable, not buried in JSONB.

|                     |             |         |                                                            |
| ------------------- | ----------- | ------- | ---------------------------------------------------------- |
| **Field**           | **Type**    | **Req** | **Notes**                                                  |
| id                  | UUID        | yes     | Primary key.                                               |
| tenant\_id          | UUID        | yes     | Denormalized for isolation.                                |
| from\_party\_id     | UUID        | yes     | The party initiating the relationship (e.g., employer).    |
| to\_party\_id       | UUID        | yes     | The party receiving the relationship (e.g., employee).     |
| relationship\_type  | TEXT        | yes     | EMPLOYS, OWNS, REPRESENTS, CONTACT\_FOR, AFFILIATED\_WITH. |
| started\_at         | TIMESTAMPTZ | yes     | When the relationship began.                               |
| ended\_at           | TIMESTAMPTZ | no      | When it ended. Null for active relationships.              |
| metadata            | JSONB       | no      | Role title, ownership percentage, etc.                     |
| (provenance fields) | \-          | yes     | Standard provenance header applies.                        |

> Open question for CRCC implementation: when a member organization's contact person leaves and a new contact takes over, do we create a new Party\_Relationship and end-date the old one? Yes. The Membership stays intact, the Party representing the contact persists, only the Party\_Relationship transitions. This is the canonical handover model and applies to all verticals.

## 3.2 Interaction

**What it is**

An Interaction is an immutable, point-in-time behavioral fact representing a touchpoint between Aloomii (or its agents) and one or more Parties, or between Parties themselves. It is the permanent record of every meaningful engagement event in the system: an email sent, a phone call logged, an event attended, a portal login, a content piece consumed, a meeting held.

Interactions are the densest table in the system by row count. A chamber with 150 members will produce thousands of Interactions per year. A real estate board with 2,000 agents will produce hundreds of thousands. The schema must be tight and well-indexed because every query that asks "what's happening with this member" hits this table.

**What it isn't**

An Interaction is not a task or a to-do. Tasks are future intentions; Interactions are past facts. An Interaction is not a Decision; Decisions are commitments to action, Interactions are records of action having occurred. An Interaction is not a Signal; Signals are interpretations derived from Interactions and other inputs.

**Lifecycle**

Created once. The structural facts of an Interaction (that it occurred, when, between which parties, through which channel, in which direction) are immutable. If an Interaction is recorded incorrectly, a correction Interaction is created that references the original. The original is not structurally modified.

PII content within an Interaction (the body\_excerpt, attachments referenced in metadata, personally-identifying text) is governed by a separate rule: it is redactable under the tombstone pattern documented in Section 4.4. A compliance process can replace body\_excerpt with "\[REDACTED-PII\]" and clear PII metadata fields in response to a PIPEDA, GDPR, or similar right-to-be-forgotten request. The structural scaffolding (who, when, what type) survives; the personal content does not. Redaction events are themselves logged in Audit\_Log.

This distinction matters legally. Pure immutability would put Aloomii out of compliance in Canada, the EU, and several US states. The tombstone pattern resolves the conflict: facts that happened cannot be denied, but personal data that should not be retained can be removed without breaking the institutional memory.

**Schema: Interaction**

|                         |             |         |                                                                  |
| ----------------------- | ----------- | ------- | ---------------------------------------------------------------- |
| **Field**               | **Type**    | **Req** | **Notes**                                                        |
| id                      | UUID        | yes     | Primary key.                                                     |
| tenant\_id              | UUID        | yes     | Denormalized for isolation.                                      |
| primary\_party\_id      | UUID        | yes     | The focal party of the interaction. Most queries filter on this. |
| interaction\_type       | TEXT        | yes     | EMAIL\_SENT, EVENT\_ATTENDED, PORTAL\_LOGIN, CALL\_LOGGED, etc.  |
| channel                 | ENUM        | yes     | EMAIL, PHONE, IN\_PERSON, PORTAL, SYSTEM\_GENERATED, EXTERNAL.   |
| direction               | ENUM        | yes     | INBOUND, OUTBOUND, BIDIRECTIONAL, INTERNAL.                      |
| occurred\_at            | TIMESTAMPTZ | yes     | When the interaction happened. Distinct from created\_at.        |
| subject                 | TEXT        | no      | Short summary. Email subject line, event name, etc.              |
| body\_excerpt           | TEXT        | no      | Truncated content for preview. Full content in metadata.         |
| generated\_artifact\_id | UUID        | no      | FK to Generated\_Artifact if this Interaction was AI-drafted.    |
| metadata                | JSONB       | no      | Channel-specific details. Duration, attachments, location, etc.  |
| (provenance fields)     | \-          | yes     | Standard provenance header applies.                              |

**Schema: Interaction\_Party (multi-party join)**

Some Interactions involve multiple Parties: a member-to-member referral, a sponsor introduction, a board meeting with several directors present. Rather than overloading the primary\_party\_id field or stuffing party lists into JSONB, multi-party Interactions are joined through this table.

|                 |             |         |                                                         |
| --------------- | ----------- | ------- | ------------------------------------------------------- |
| **Field**       | **Type**    | **Req** | **Notes**                                               |
| interaction\_id | UUID        | yes     | FK to Interaction. Compound primary key with party\_id. |
| party\_id       | UUID        | yes     | FK to Party. Compound primary key with interaction\_id. |
| role            | TEXT        | yes     | PRIMARY, PARTICIPANT, MENTIONED, ORGANIZER, OBSERVER.   |
| tenant\_id      | UUID        | yes     | Denormalized for isolation.                             |
| created\_at     | TIMESTAMPTZ | yes     | When this party-interaction link was recorded.          |

> Decision: system-generated events (renewal reminder emails sent by an agent, automated follow-up sequences, scheduled reports) are stored in the Interaction table with channel=SYSTEM\_GENERATED and created\_by set to the agent ID. They are not segregated into a separate "automated events" table. Discipline is required: analytics queries must filter on channel when comparing human vs automated activity. The simpler schema is worth the filtering discipline.

## 3.3 Signal

**What it is**

A Signal is a point-in-time inference or observation that something has changed in a way that warrants attention. Signals are interpretations, not facts. They are produced by rule engines, agents, anomaly detectors, or external data feeds, and they are explicitly probabilistic, and every Signal carries a confidence score.

Examples: a member's renewal date is approaching with no recent engagement (churn risk Signal). A press mention of a member's company appears in the local news (opportunity Signal). A board member has not been contacted in 90 days (relationship-decay Signal). A license is set to expire and the holder has not yet completed required CE credits (compliance Signal).

**What it isn't**

A Signal is not an Interaction; Interactions are observed events, Signals are derived interpretations of those events. A Signal is not a Decision; Signals can be ignored, dismissed, or acted upon. Most importantly, a Signal is not a flag on the Party or Membership table. Flags-on-current-state is the anti-pattern this entity exists to eliminate.

**Lifecycle**

Signals are generated automatically by rules and agents. They have expiration dates because most Signals are time-relative (a churn risk from 2021 is irrelevant today). They progress through statuses: ACTIVE → ACTED\_UPON | EXPIRED | DISMISSED. Once a status terminates, the Signal is preserved as an immutable record for downstream learning.

**Schema: Signal**

|                               |              |         |                                                                                |
| ----------------------------- | ------------ | ------- | ------------------------------------------------------------------------------ |
| **Field**                     | **Type**     | **Req** | **Notes**                                                                      |
| id                            | UUID         | yes     | Primary key.                                                                   |
| tenant\_id                    | UUID         | yes     | Denormalized for isolation.                                                    |
| subject\_party\_id            | UUID         | no      | FK to Party. Exactly one of the three subject\_\*\_id fields must be non-null. |
| subject\_membership\_id       | UUID         | no      | FK to Membership. Mutually exclusive with other subject\_\*\_id fields.        |
| subject\_interaction\_id      | UUID         | no      | FK to Interaction. Mutually exclusive with other subject\_\*\_id fields.       |
| signal\_type                  | TEXT         | yes     | CHURN\_RISK, COMPLIANCE\_WARNING, OPPORTUNITY, RELATIONSHIP\_DECAY, etc.       |
| severity                      | ENUM         | yes     | LOW, MEDIUM, HIGH, CRITICAL. Drives downstream prioritization.                 |
| confidence                    | DECIMAL(3,2) | yes     | 0.00 to 1.00. Required. Drives signal quality tuning.                          |
| status                        | ENUM         | yes     | ACTIVE, ACTED\_UPON, EXPIRED, DISMISSED.                                       |
| generated\_at                 | TIMESTAMPTZ  | yes     | When the Signal fired.                                                         |
| expires\_at                   | TIMESTAMPTZ  | no      | When it stops being relevant. Null for permanent signals.                      |
| generated\_by                 | TEXT         | yes     | Agent ID, rule ID, or external feed ID.                                        |
| evidence                      | JSONB        | yes     | Structured pointers to the data that supported this signal.                    |
| acted\_upon\_by\_decision\_id | UUID         | no      | FK to Decision if a decision was made in response.                             |
| dismissed\_reason             | TEXT         | no      | If status is DISMISSED, why.                                                   |
| (provenance fields)           | \-           | yes     | Standard provenance header applies.                                            |

> On the exclusive-arc pattern. Signal, Decision, Outcome, and Generated\_Artifact all use three or more nullable foreign-key columns governed by a CHECK constraint that requires exactly one to be non-null. This replaces the more conventional subject\_type ENUM plus subject\_id UUID pattern, which Postgres cannot enforce referential integrity on. The cost is slightly more verbose queries (joins must COALESCE across the nullable columns); the benefit is that orphan records become structurally impossible. This aligns with Principle 2.1: structural enforcement over discipline.

> The evidence field is the single most important field on Signal. Without it, a Signal is an unjustified assertion. The evidence field must contain structured pointers (UUIDs to source records, score values, rule conditions met) that allow the question "why did the system flag this?" to be answered definitively. Free-text justification is not acceptable in this field.

Confidence is required, not optional. A churn Signal at 0.95 confidence drives different downstream behavior than one at 0.55. Confidence values feed back into Moat 3 (the learning loop): Signals that fire at high confidence and prove correct over time validate the underlying rule; Signals that fire at high confidence and prove incorrect indicate the rule needs tuning. None of this works without confidence as a first-class field.

## 3.4 Decision

**What it is**

A Decision is an authoritative commitment to an action or status change. Decisions represent intent and are the bridge between observation (Signal) and consequence (Outcome). They are the most important entity for Moat 2 (institutional memory), because the reasoning behind a Decision is the institutional intelligence that survives staff turnover.

Examples: the chamber president decides not to renew SponsorX's premier-tier contract. The board approves a fellowship designation for an applicant. The membership committee suspends an agent for compliance violations. The executive director decides to defer a strategic initiative by one quarter.

**What it isn't**

A Decision is not the action itself. "Suspend agent's MLS access" is the Decision. The actual revocation of access, when it physically happens in the system at a specific timestamp, is the Outcome. A Decision is not a Signal; Signals can be ignored, Decisions are committed-to. A Decision is not a free-text note; it is a structured record with required reasoning.

**Lifecycle**

Decisions move through statuses: PROPOSED → RATIFIED → ENACTED → (optionally) REVERSED or EXPIRED. Some decisions are unilateral (an executive director acts on their own authority) and skip the PROPOSED stage. Others require two-stage approval (a committee proposes, the board ratifies). Decisions can be reversed by subsequent Decisions, with the reversal explicitly captured.

**Schema: Decision**

|                            |             |         |                                                                      |
| -------------------------- | ----------- | ------- | -------------------------------------------------------------------- |
| **Field**                  | **Type**    | **Req** | **Notes**                                                            |
| id                         | UUID        | yes     | Primary key.                                                         |
| tenant\_id                 | UUID        | yes     | Denormalized for isolation.                                          |
| decision\_type             | TEXT        | yes     | RENEW, NON\_RENEWAL, SUSPEND\_ACCESS, GRANT\_FELLOWSHIP, DEFER, etc. |
| subject\_party\_id         | UUID        | no      | FK to Party. Subject of the decision, if applicable.                 |
| subject\_membership\_id    | UUID        | no      | FK to Membership. Mutually exclusive with subject\_party\_id.        |
| subject\_outcome\_id       | UUID        | no      | FK to Outcome. Mutually exclusive with other subject\_\*\_id fields. |
| status                     | ENUM        | yes     | PROPOSED, RATIFIED, ENACTED, REVERSED, EXPIRED.                      |
| decided\_at                | TIMESTAMPTZ | yes     | When the decision was made.                                          |
| decided\_by\_party\_id     | UUID        | yes     | FK to Party who made the decision.                                   |
| ratified\_by\_party\_id    | UUID        | no      | FK to Party who ratified. For two-stage decisions.                   |
| ratified\_at               | TIMESTAMPTZ | no      | When ratification occurred.                                          |
| effect\_start\_date        | TIMESTAMPTZ | yes     | When the decision takes effect.                                      |
| effect\_end\_date          | TIMESTAMPTZ | no      | When effect ends. Null for permanent. E.g., 90-day suspension.       |
| reasoning                  | TEXT        | yes     | Structured prose explaining why. Required. Not optional.             |
| alternatives\_considered   | JSONB       | no      | What other options were on the table and why rejected.               |
| evidence                   | JSONB       | yes     | Structured pointers to Interactions, Signals, prior Decisions.       |
| triggered\_by\_signal\_id  | UUID        | no      | FK to Signal if this decision responds to one.                       |
| reversed\_by\_decision\_id | UUID        | no      | FK to the Decision that reversed this one, if applicable.            |
| (provenance fields)        | \-          | yes     | Standard provenance header applies.                                  |

> The reasoning, alternatives\_considered, and evidence fields together form the institutional memory artifact. Three years from now, when a new executive director asks "why did we decide not to renew SponsorX in 2026?", these three fields produce the complete answer: the reasoning prose, the alternatives that were considered and rejected, and the structured evidence (links to missed events, churn signals, communications) that supported the decision. This is the moat. Treat these fields as non-negotiable at write time.

## 3.5 Outcome

**What it is**

An Outcome is the actualized result of a Decision, Interaction, Signal, or Generated Artifact in the real world. Outcomes are the proof points that turn intent into measured reality. They are what makes ROI demonstrable and what feeds the learning loop (Moat 3) that lets the system measurably improve over time.

Examples: SponsorX's annual renewal is signed and $5,000 of revenue is booked (financial Outcome). An agent's MLS access is physically revoked at a specific timestamp (operational Outcome). A member who received targeted re-engagement outreach attends an event two weeks later (engagement Outcome). A content piece is published and produces 247 link clicks over 30 days (content performance Outcome).

**What it isn't**

An Outcome is not a Decision; Decisions are intent, Outcomes are result. An Outcome is not an Interaction; Interactions are events that happened, Outcomes are measurable consequences of prior intent. An Outcome is always trailing. It requires a cause to point back at.

**Lifecycle**

Outcomes are written once when reality catches up to intent (or when a measurement is taken). Outcomes are immutable. A single cause can produce multiple Outcomes over time. A renewal Decision produces an immediate financial Outcome and subsequent engagement Outcomes over the year. The schema explicitly supports this one-cause-to-many-outcomes pattern.

**Schema: Outcome**

|                             |               |         |                                                                                                                        |
| --------------------------- | ------------- | ------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Field**                   | **Type**      | **Req** | **Notes**                                                                                                              |
| id                          | UUID          | yes     | Primary key.                                                                                                           |
| tenant\_id                  | UUID          | yes     | Denormalized for isolation.                                                                                            |
| outcome\_type               | TEXT          | yes     | REVENUE\_BOOKED, ACCESS\_REVOKED, EVENT\_ATTENDED, EMAIL\_REPLIED, etc.                                                |
| caused\_by\_decision\_id    | UUID          | no      | FK to Decision. Exactly one caused\_by\_\*\_id must be non-null.                                                       |
| caused\_by\_interaction\_id | UUID          | no      | FK to Interaction. Mutually exclusive.                                                                                 |
| caused\_by\_signal\_id      | UUID          | no      | FK to Signal. Mutually exclusive.                                                                                      |
| caused\_by\_artifact\_id    | UUID          | no      | FK to Generated\_Artifact. Mutually exclusive.                                                                         |
| subject\_party\_id          | UUID          | no      | FK to Party. Exactly one subject\_\*\_id must be non-null.                                                             |
| subject\_membership\_id     | UUID          | no      | FK to Membership. Mutually exclusive.                                                                                  |
| attribution\_share          | DECIMAL(3,2)  | yes     | 0.00 to 1.00. Defaults to 1.00. Used for multi-cause attribution. ROI queries multiply financial\_value by this share. |
| financial\_value            | DECIMAL(12,2) | no      | Monetary value. Crucial for ROI tracking. Null if not financial.                                                       |
| financial\_currency         | TEXT          | no      | ISO currency code if financial\_value is set.                                                                          |
| realized\_at                | TIMESTAMPTZ   | yes     | When the outcome happened in the real world.                                                                           |
| measured\_at                | TIMESTAMPTZ   | yes     | When we recorded the outcome. May lag realized\_at.                                                                    |
| measurement\_method         | TEXT          | yes     | MANUAL\_LOG, AUTOMATED\_DETECTION, INFERRED, EXTERNAL\_FEED.                                                           |
| confidence                  | DECIMAL(3,2)  | yes     | How confident are we this outcome happened as recorded.                                                                |
| score                       | DECIMAL(5,2)  | no      | Quantitative outcome score where applicable. Open scale.                                                               |
| metadata                    | JSONB         | no      | Outcome-type-specific details.                                                                                         |
| (provenance fields)         | \-            | yes     | Standard provenance header applies.                                                                                    |

measurement\_method and confidence together capture the uncertainty in Outcome measurement. A payment that cleared in Stripe (MANUAL\_LOG or AUTOMATED\_DETECTION at confidence 1.00) is qualitatively different from an inferred engagement uptick (INFERRED at confidence 0.65). ROI dashboards that aggregate Outcomes must respect this distinction or they produce misleading averages.

The polymorphic caused\_by field allows the system to attribute outcomes to whatever produced them. This is the critical join that makes Moat 3 (the learning loop) work: every Outcome can be traced back to the Decision, Interaction, Signal, or Generated Artifact that caused it, and from there to the prompts, models, and inputs that produced that cause.

## 3.6 Generated Artifact (seventh entity)

**What it is**

A Generated Artifact is any output produced by an Aloomii agent, model, or AI-assisted process before it becomes an Interaction in the world. An AI-drafted email is a Generated Artifact until it is sent (at which point an Interaction is also created and the two are linked). A content piece is a Generated Artifact until it is published. A recommendation is a Generated Artifact even if no one acts on it.

This entity exists because Interactions are immutable point-in-time events that have happened, while AI outputs go through a draft → review → edit → send lifecycle that requires its own structured home. Without this entity, the learning loop cannot function. There is no way to trace a sent email back to the prompt, model, and source data that produced its draft.

**What it isn't**

A Generated Artifact is not an Interaction. An Interaction is what happens after a Generated Artifact is acted upon. A Generated Artifact is not a Decision; Decisions are commitments made by Parties, Generated Artifacts are outputs produced by systems. A Generated Artifact is not free-floating; every artifact has a clear lineage to inputs, prompts, and model.

**Lifecycle**

Generated Artifacts move through statuses: DRAFTED → REVIEWED → APPROVED → DISPATCHED | DISCARDED. Once DISPATCHED, the artifact is linked to a created Interaction (via Interaction.generated\_artifact\_id) and an eventual Outcome. Once DISCARDED, the artifact remains in the database as a training example, capturing what the system produced and what a human chose not to use.

**Schema: Generated\_Artifact**

|                                 |              |         |                                                                                                    |
| ------------------------------- | ------------ | ------- | -------------------------------------------------------------------------------------------------- |
| **Field**                       | **Type**     | **Req** | **Notes**                                                                                          |
| id                              | UUID         | yes     | Primary key.                                                                                       |
| tenant\_id                      | UUID         | yes     | Denormalized for isolation.                                                                        |
| artifact\_type                  | TEXT         | yes     | EMAIL\_DRAFT, CONTENT\_DRAFT, RECOMMENDATION, SUMMARY, ALERT, etc.                                 |
| target\_party\_id               | UUID         | no      | FK to Party this artifact is directed at, if applicable.                                           |
| target\_membership\_id          | UUID         | no      | FK to Membership. Alternative to target\_party\_id when applicable.                                |
| target\_event\_id               | UUID         | no      | FK to Event if target is event-related. Mutually exclusive with other targets.                     |
| status                          | ENUM         | yes     | DRAFTED, REVIEWED, APPROVED, DISPATCHED, DISCARDED.                                                |
| prompt\_template\_id            | TEXT         | yes     | Which prompt template produced this artifact.                                                      |
| prompt\_template\_version       | TEXT         | yes     | Version of the template. Templates evolve.                                                         |
| model\_used                     | TEXT         | yes     | gemini-3.1-pro-preview, kimi, gpt-X, etc.                                                          |
| model\_parameters               | JSONB        | yes     | Temperature, max\_tokens, system prompt variant, etc.                                              |
| input\_records                  | JSONB        | yes     | Array of structured refs: \[{"entity": "Signal", "id": "uuid"}, ...\]. Preserves table provenance. |
| output\_content                 | TEXT         | yes     | The actual artifact content.                                                                       |
| output\_metadata                | JSONB        | no      | Token counts, generation time, cost, etc.                                                          |
| human\_reviewed                 | BOOLEAN      | yes     | Was this reviewed by a human before dispatch.                                                      |
| human\_edits                    | TEXT         | no      | Diff or full edited version if a human modified it.                                                |
| dispatched\_as\_interaction\_id | UUID         | no      | FK to Interaction if this was sent.                                                                |
| outcome\_id                     | UUID         | no      | FK to Outcome. Filled in when outcome is known.                                                    |
| outcome\_score                  | DECIMAL(5,2) | no      | Quantitative score of how this artifact performed.                                                 |
| (provenance fields)             | \-           | yes     | Standard provenance header applies.                                                                |

> The Generated\_Artifact table is the heart of the Moat 3 learning loop. Every artifact has a complete trace: prompt\_template\_id and version (which template produced it), model\_used (which LLM), input\_record\_ids (what data informed it), human\_edits (what a human changed), dispatched\_as\_interaction\_id (whether it was sent), outcome\_id (what happened next). Eighteen months from now, Aloomii queries this table to find "which prompt templates produced artifacts with the best outcomes for members with profile X," and that query is the moat.

## 3.7 Supporting tables

Beyond the eight canonical entities, the schema includes several supporting tables that handle cross-cutting concerns. These are not entities in the conceptual sense. They exist to support querying, integration, or compliance, but they are structurally necessary.

**Tenant**

The root of the tenancy tree. One row per customer organization. All other tables carry tenant\_id to enforce isolation.

|               |             |         |                                                         |
| ------------- | ----------- | ------- | ------------------------------------------------------- |
| **Field**     | **Type**    | **Req** | **Notes**                                               |
| id            | UUID        | yes     | Primary key. The canonical tenant identifier.           |
| name          | TEXT        | yes     | Display name. "Caledonia Regional Chamber of Commerce". |
| short\_name   | TEXT        | yes     | Slug-friendly short name. "crcc".                       |
| vertical      | TEXT        | yes     | CHAMBER, REAL\_ESTATE, ASSOCIATION, etc.                |
| status        | ENUM        | yes     | ACTIVE, SUSPENDED, ARCHIVED.                            |
| schema\_name  | TEXT        | yes     | Postgres schema name for this tenant. See Section 5.    |
| onboarded\_at | TIMESTAMPTZ | yes     | When the tenant became active.                          |
| metadata      | JSONB       | no      | Tenant-specific configuration.                          |

**Transaction**

Financial events live here, not in Interactions. Dues payments, sponsor fees, event registrations, refunds. Transactions reference Memberships (or Parties directly for one-off payments) and produce financial Outcomes.

|                           |               |         |                                                                |
| ------------------------- | ------------- | ------- | -------------------------------------------------------------- |
| **Field**                 | **Type**      | **Req** | **Notes**                                                      |
| id                        | UUID          | yes     | Primary key.                                                   |
| tenant\_id                | UUID          | yes     | Denormalized for isolation.                                    |
| membership\_id            | UUID          | no      | FK to Membership if this is dues-related.                      |
| party\_id                 | UUID          | yes     | FK to Party who paid.                                          |
| transaction\_type         | TEXT          | yes     | DUES\_PAYMENT, SPONSOR\_FEE, EVENT\_REGISTRATION, REFUND, etc. |
| gross\_amount             | DECIMAL(12,2) | yes     | Pre-fee amount.                                                |
| net\_amount               | DECIMAL(12,2) | yes     | Post-fee amount actually received.                             |
| currency                  | TEXT          | yes     | ISO currency code.                                             |
| external\_transaction\_id | TEXT          | no      | Stripe charge ID, Zeffy ID, etc.                               |
| transacted\_at            | TIMESTAMPTZ   | yes     | When the transaction cleared.                                  |
| produces\_outcome\_id     | UUID          | no      | FK to Outcome that records the financial impact.               |
| (provenance fields)       | \-            | yes     | Standard provenance header applies.                            |

**Audit\_Log**

Cross-table audit log capturing every meaningful read and write operation against tenant data. Append-only, queryable for compliance investigations, retained according to regulatory requirements.

|             |             |         |                                               |
| ----------- | ----------- | ------- | --------------------------------------------- |
| **Field**   | **Type**    | **Req** | **Notes**                                     |
| id          | UUID        | yes     | Primary key.                                  |
| tenant\_id  | UUID        | yes     | Which tenant's data was accessed.             |
| actor\_type | ENUM        | yes     | USER, AGENT, SYSTEM.                          |
| actor\_id   | TEXT        | yes     | ID of the actor.                              |
| action      | TEXT        | yes     | READ, WRITE, UPDATE, DELETE, EXPORT, etc.     |
| table\_name | TEXT        | yes     | Which table was touched.                      |
| record\_id  | UUID        | no      | Which record, if applicable.                  |
| query\_hash | TEXT        | no      | Hash of the query for similar-query analysis. |
| timestamp   | TIMESTAMPTZ | yes     | When this occurred.                           |
| metadata    | JSONB       | no      | Action-specific details.                      |

**Patterns (cross-tenant aggregate table)**

Anonymized, k-anonymous aggregate data that powers cross-tenant learning. Lives in a separate database (see Section 5.3) and is the only data that crosses tenant boundaries. No foreign keys point back at individual tenant records.

|                         |             |         |                                                              |
| ----------------------- | ----------- | ------- | ------------------------------------------------------------ |
| **Field**               | **Type**    | **Req** | **Notes**                                                    |
| id                      | UUID        | yes     | Primary key.                                                 |
| pattern\_type           | TEXT        | yes     | CHURN\_PRECURSOR, ENGAGEMENT\_LIFT, RENEWAL\_PREDICTOR, etc. |
| vertical                | TEXT        | yes     | Which vertical this pattern is derived from.                 |
| sample\_size            | INTEGER     | yes     | How many anonymized records contributed.                     |
| k\_anonymity\_threshold | INTEGER     | yes     | k value used. Records with k below threshold excluded.       |
| pattern\_data           | JSONB       | yes     | Structured pattern. Coefficients, weights, rule logic, etc.  |
| confidence\_interval    | JSONB       | no      | Statistical confidence bounds.                               |
| generated\_at           | TIMESTAMPTZ | yes     | When this pattern was computed.                              |
| expires\_at             | TIMESTAMPTZ | no      | When this pattern should be recomputed.                      |
| pipeline\_version       | TEXT        | yes     | Version of the aggregation pipeline that produced it.        |

## 3.8 Entity relationship summary

The canonical relationships between the eight entities and supporting tables, expressed as directional flows:

**Party → Membership**

A Party can hold zero or many Memberships across one or more tenants. A Membership belongs to exactly one Party. Memberships transition through State\_Events.

**Party ↔ Party (via Party\_Relationship)**

Parties relate to other Parties through time-bound, typed relationships. Many-to-many with attributes.

**Party ↔ Interaction (via primary\_party\_id and Interaction\_Party)**

A Party participates in many Interactions. An Interaction has one primary Party and zero-or-more additional Parties.

**Party / Membership / Interaction → Signal**

Signals are polymorphic. They can be about a Party, a Membership, or an Interaction. The exclusive-arc pattern (three nullable FK columns with a CHECK constraint requiring exactly one to be non-null) preserves referential integrity that a free-form subject\_type ENUM cannot.

**Signal → Decision (via triggered\_by\_signal\_id)**

A Signal may trigger a Decision. The link is captured on the Decision row.

**Decision → Outcome (via Outcome.caused\_by\_decision\_id)**

A Decision produces zero or many Outcomes over time. Outcomes carry the financial and operational impact.

**Generated\_Artifact → Interaction → Outcome**

This is the learning loop. An artifact is generated, optionally dispatched (becoming an Interaction), and eventually produces an Outcome. The chain is queryable end-to-end.

**Signal / Decision → Task → Interaction**

This is the work loop. A Signal or Decision may produce one or more Tasks. A completed Task references the Interaction it produced via completed\_as\_interaction\_id, closing the chain from intention to fact. Tasks owned by agents complete this loop autonomously; tasks owned by humans complete it manually.

**Transaction → Outcome**

Financial transactions produce financial Outcomes. The Transaction record holds the operational details; the Outcome record holds the impact framing.

> Every relationship above is queryable. There are no relationships hidden in JSONB metadata that require parsing to traverse. This is a deliberate constraint that pays off enormously in analytics, reporting, and the cross-tenant learning pipeline.

## 3.9 Task (added in v1.2)

Task is the forward-looking complement to Interaction. Where an Interaction is a fact that happened, a Task is an intention to do something in the future. Where a Decision commits to an action with effect dates, a Task is the operational work needed to enact that commitment or otherwise advance a relationship.

Task was deliberately absent from v1.0 and v1.1 of this architecture. The membership-organization use case (chambers, associations, real estate boards) cares more about what did happen than what will happen, and the v1.0 design favored that asymmetry. Adding Task in v1.2 closes the gap that prevents Aloomii from supporting traditional CRM use cases (sales teams, account-based B2B, advisory firms, professional services) where forward-looking work is the primary user activity.

**What it is**

A Task is a unit of forward-looking work assigned to a Party (typically a staff member or an AI agent) about a specific subject (a Party, Membership, or Decision). Examples: "Call John Doe on Friday about renewal", "Send proposal draft to Acme Corp by end of week", "Review the suspension decision before Tuesday's board meeting", "Draft re-engagement email for members showing churn signals".

Tasks have a clear lifecycle (PENDING → IN\_PROGRESS → COMPLETED or CANCELLED) and a due date. They are created by either a human user or an autonomous agent, and they may be assigned to either a human or an agent. The architecture treats both equivalently at the schema level; what differs is the metadata captured about how the task was created and who it is assigned to.

**What it isn't**

A Task is not an Interaction. Interactions are facts about events that have occurred; Tasks are intentions about events that should occur. Once a Task is completed, the work it produced is captured as a new Interaction, and the Task references that Interaction via completed\_as\_interaction\_id.

A Task is not a Decision. Decisions are commitments to a position or course of action ("we will not renew SponsorX"); Tasks are the operational steps that enact or follow from those decisions ("send non-renewal letter to SponsorX by Friday"). A single Decision can produce many Tasks.

A Task is not a Signal. Signals are derived observations that may warrant action; Tasks are committed work that has been planned. A Signal might trigger a Task, in which case the Task references the Signal that produced it, but the two are structurally distinct.

**Lifecycle**

Tasks are created either manually (a user adds a follow-up reminder) or automatically (an agent generates work in response to a Signal, a Decision, or a scheduled pattern). They progress through PENDING → IN\_PROGRESS → COMPLETED, or are CANCELLED if no longer relevant. The status field on Task is mutable, with version increments captured in Audit\_Log.

When a Task is completed, the work performed produces an Interaction (a call logged, an email sent, a meeting held). The Task's completed\_as\_interaction\_id field is set at that point, creating the structural link between planned work and historical record. This link is the central feature of the Task entity and is what enables the AI learning loop to evaluate task effectiveness.

**Schema: Task**

|                                |             |         |                                                                                     |
| ------------------------------ | ----------- | ------- | ----------------------------------------------------------------------------------- |
| **Field**                      | **Type**    | **Req** | **Notes**                                                                           |
| id                             | UUID        | yes     | Primary key. Use uuid\_generate\_v7() per Section 8.                                |
| tenant\_id                     | UUID        | yes     | Denormalized for isolation.                                                         |
| assigned\_to\_party\_id        | UUID        | no      | FK to Party. The human (or staff Party) responsible for the task.                   |
| assigned\_to\_agent\_id        | TEXT        | no      | Agent identifier. Used when an autonomous agent owns the task.                      |
| about\_party\_id               | UUID        | no      | Subject of the task. Exactly one about\_\*\_id must be non-null.                    |
| about\_membership\_id          | UUID        | no      | Subject of the task. Mutually exclusive with about\_party\_id, about\_decision\_id. |
| about\_decision\_id            | UUID        | no      | Subject of the task. Mutually exclusive with the other about\_\*\_id fields.        |
| task\_type                     | TEXT        | yes     | FOLLOW\_UP, CALL, EMAIL, REVIEW, DRAFT, SCHEDULE, etc. Vertical-extensible.         |
| description                    | TEXT        | yes     | Human-readable task description. Required for accountability.                       |
| status                         | ENUM        | yes     | PENDING, IN\_PROGRESS, COMPLETED, CANCELLED.                                        |
| priority                       | ENUM        | no      | LOW, MEDIUM, HIGH, URGENT. Defaults to MEDIUM.                                      |
| due\_at                        | TIMESTAMPTZ | no      | When the task should be completed. Null for open-ended.                             |
| completed\_at                  | TIMESTAMPTZ | no      | When the task was actually completed.                                               |
| completed\_as\_interaction\_id | UUID        | no      | FK to Interaction produced by completing this task.                                 |
| triggered\_by\_signal\_id      | UUID        | no      | FK to Signal if this task was created in response to a signal.                      |
| triggered\_by\_decision\_id    | UUID        | no      | FK to Decision if this task enacts a decision.                                      |
| cancelled\_reason              | TEXT        | no      | Required if status is CANCELLED. Why the task is no longer relevant.                |
| metadata                       | JSONB       | no      | Task-type-specific details. Suggested wording, prior context, etc.                  |
| (provenance fields)            | \-          | yes     | Standard provenance header. See Section 4.1 and the discussion below.               |

> On assignment: exactly one of assigned\_to\_party\_id or assigned\_to\_agent\_id must be non-null. A CHECK constraint enforces this. A Task is always owned by exactly one actor, human or agent, never both and never neither. Re-assignment from human to agent (or the reverse) is captured as an Audit\_Log entry and a new version of the Task row.

**Human vs. agent provenance on Task**

The most operationally important question about Task is who created it and who is responsible for completing it. With autonomous agents generating tasks at scale, distinguishing agent-created from human-created work is critical for accountability, audit, debugging, and trust calibration. This question requires careful structural treatment rather than a freeform metadata convention.

The architecture handles this through two distinct mechanisms that work together: the universal provenance fields on Task itself, and the exclusive arc between assigned\_to\_party\_id and assigned\_to\_agent\_id.

**Creation provenance via the created\_by field**

The universal provenance header (Section 4.1) defines created\_by as a TEXT field with a structured prefix convention. For Task records this is enforced strictly:

  - **"user:\<party\_id\>"** when a human creates a task through the UI or API.

  - **"agent:\<agent\_id\>:\<run\_id\>"** when an autonomous agent creates a task. The run\_id allows backtracing to the specific agent invocation that produced this task, which is essential for debugging agent behavior and evaluating agent effectiveness over time.

  - **"system:\<process\_name\>"** when a deterministic scheduled process creates a task (e.g. quarterly renewal reminder generator). Distinct from agent-created because the logic is rule-based, not AI-driven.

Querying "all tasks created by autonomous agents in the last 30 days" becomes a simple WHERE created\_by LIKE 'agent:%' AND created\_at \> NOW() - INTERVAL '30 days'. The structured prefix makes this both fast and clear without requiring a separate enum column.

**Assignment ownership via the exclusive arc**

Creation and assignment are separate questions. A human can create a task and assign it to an agent ("agent, draft a follow-up email to Acme Corp by Friday"). An agent can create a task and assign it to a human ("a churn signal fired; staff member should call this member within 48 hours"). Both patterns are common and must be representable without ambiguity.

assigned\_to\_party\_id and assigned\_to\_agent\_id form an exclusive arc with a CHECK constraint requiring exactly one to be non-null. The combination of created\_by and the assigned-to columns gives the four meaningful provenance permutations:

|                |                 |                        |                                                             |
| -------------- | --------------- | ---------------------- | ----------------------------------------------------------- |
| **Created by** | **Assigned to** | **Pattern name**       | **Example**                                                 |
| Human          | Human           | **Manual self-task**   | Staff member adds a personal reminder to call a member      |
| Human          | Agent           | **Delegated to agent** | Staff assigns an outreach drafting task to a content agent  |
| Agent          | Human           | **Agent escalation**   | Churn-signal agent flags work for human attention           |
| Agent          | Agent           | **Autonomous chain**   | One agent's output triggers another agent's downstream work |

All four permutations are valid and operationally common. The schema makes all four queryable as first-class patterns. "Show me all tasks where an agent assigned work to a human in the last 7 days" is a simple two-clause WHERE; the same query against a typical CRM is impossible without ad-hoc convention-based tagging.

**Why this matters for the moat**

The agent-escalation and autonomous-chain patterns are where Aloomii's competitive position actually lives. Traditional CRMs treat tasks as a flat list assigned to humans. Aloomii's architecture treats tasks as a coordinated workstream across humans and agents, with provenance preserved at every step. This produces three concrete advantages:

  - **Auditability.** Every task can be traced back to its origin: which agent, which run, which Signal, which Decision. When a customer asks "why did your system send my member an email I didn't approve", the answer is a structured chain, not a guess.

  - **Effectiveness measurement.** Tasks created by agents that complete successfully and produce positive Outcomes are training signal for agent improvement. Tasks created by agents that get cancelled or produce negative Outcomes are training signal for agent restraint. The chain Generated\_Artifact → Task → Interaction → Outcome is the full closed loop.

  - **Trust calibration.** Customers can see and configure which task types agents are allowed to create autonomously vs. which require human approval. The metadata to support this lives natively in the schema rather than being bolted on later.

> An important constraint: agents must never create Tasks that bypass human review for high-stakes work. The application layer enforces an approval-required policy per task\_type, configured per tenant. The schema supports this but does not enforce it; that responsibility lives one layer up. This is intentional. The schema captures what happened; the application enforces what is allowed.

## 3.10 Opportunity / Deal as first-class entity (documented gap)

Traditional sales CRMs (Salesforce, HubSpot, Pipedrive, Close) treat the sales Opportunity (also called Deal) as a first-class entity with rich stage logic, win/loss tracking, weighted forecasting, expected close dates, and probability scoring. Aloomii's current architecture does not have a dedicated Opportunity entity. This section documents the deliberate gap, the workaround pattern, and the future migration path if the gap needs to close.

**Current pattern: Decision as proposed Opportunity**

An Opportunity is structurally a Decision-in-progress about whether to enter into a contractual relationship. The architecture already supports this pattern through the Decision entity's PROPOSED → RATIFIED → ENACTED lifecycle:

  - **A new sales prospect** is a Decision in PROPOSED status, with decision\_type = NEW\_MEMBERSHIP, subject\_party\_id pointing to the prospect, and reasoning capturing the current state of the conversation.

  - **Stage progression** is captured as updates to the Decision (with full Audit\_Log history) or as a sequence of related Tasks ("send proposal", "hold demo", "close call") that together advance the Decision toward ratification.

  - **Win** is the Decision transitioning to ENACTED status, which produces a new Membership and a financial Outcome.

  - **Loss** is the Decision transitioning to EXPIRED or REVERSED with a non-renewal reason captured in reasoning.

This pattern works well for the deliberate, relationship-driven sales motions Aloomii is built for. It does not work as well for high-velocity transactional pipelines where 200+ opportunities flow through a process per quarter and dedicated forecasting math is required.

**Why this is deliberate**

Adding a first-class Opportunity entity now would optimize for a use case Aloomii has not yet committed to serving. Premature schema bloat has real costs: every new entity adds query surface area, vertical-mapping work, and patterns-pipeline complexity. The membership-organization vertical and adjacent relationship-driven verticals (professional services, advisory, account-based B2B) all map cleanly to the Decision pattern. Until a customer's actual workflow demands the Opportunity entity, the lean architecture wins.

Treating an Opportunity as a proposed Decision also has a structural advantage that traditional CRMs lack: the reasoning, alternatives\_considered, and evidence fields on Decision capture the full sales narrative as structured data, not just stage progressions. "Why did we lose Acme Corp" is answerable with structured causes rather than a free-text loss reason field. This is the moat applied to a sales context.

**Future migration path: dedicated Opportunity entity**

If a future customer engagement or vertical expansion requires native Opportunity support (the trigger would be a high-velocity sales motion or a customer requirement for native forecasting features), the migration is straightforward:

  - Add an Opportunity entity that is structurally Membership-pre-existence: a prospective contract with stage, probability, expected\_value, expected\_close\_at, and won\_lost\_status fields.

  - Add Opportunity\_Stage\_Event as the append-only ledger of stage transitions, mirroring State\_Event for Membership.

  - Decisions about Opportunities (advance to next stage, close as won, close as lost) remain in the Decision entity, with subject\_opportunity\_id added to the exclusive arc.

  - Migrate historical Opportunities-as-Decisions to native Opportunity records through a one-time backfill, preserving the Decision history as a reference chain.

  - Existing Membership and State\_Event semantics remain unchanged. Opportunity is upstream of Membership in the lifecycle, not a replacement for it.

The migration is well-scoped because the Decision-as-Opportunity pattern already captures the conceptual structure. The future entity is more specialized, not fundamentally different. This is the right time to add it: when a customer's workflow demands it, not before.

> Decision on naming: even after adding a dedicated Opportunity entity, Aloomii's external positioning should resist the "CRM" frame. The architecture supports CRM use cases; the product is institutional intelligence infrastructure. The word "CRM" anchors buyers to commodity per-seat pricing and Salesforce-style feature comparisons. The moat is the learning loop, the institutional memory, and the cross-customer patterns layer, not the pipeline visualization. Lead with what the architecture uniquely enables, not with the category it happens to subsume.

# 4. Provenance and outcome plumbing

## 4.1 Universal metadata header

Every row in every tenant-owned table carries a standard set of provenance fields. These fields are not optional, not nullable except where noted, and not retrofittable. They are added at schema creation and they travel with every record for its entire lifetime.

|             |              |         |                                                                                           |
| ----------- | ------------ | ------- | ----------------------------------------------------------------------------------------- |
| **Field**   | **Type**     | **Req** | **Notes**                                                                                 |
| id          | UUID         | yes     | Use uuid\_generate\_v7() for time-ordered UUIDs. Never autoincrement.                     |
| tenant\_id  | UUID         | yes     | The tenant this record belongs to. Enforced by RLS and schema isolation.                  |
| created\_at | TIMESTAMPTZ  | yes     | Server-side timestamp at insert. With timezone.                                           |
| created\_by | TEXT         | yes     | Actor that created the record. "user:\<uuid\>" or "agent:\<id\>" or "system:\<process\>". |
| updated\_at | TIMESTAMPTZ  | no      | Server-side timestamp of last update. Null until first update.                            |
| updated\_by | TEXT         | no      | Actor of the last update. Same format as created\_by.                                     |
| source      | TEXT         | yes     | MANUAL, IMPORT, AGENT, API, MIGRATION, etc.                                               |
| confidence  | DECIMAL(3,2) | varies  | Required where applicable (Signal, Outcome, AI artifacts). Null elsewhere.                |
| version     | INTEGER      | yes     | Increments on update. Defaults to 1. Supports optimistic concurrency.                     |

These fields are implemented via a Postgres composite type or trait pattern, not copied manually into every CREATE TABLE statement. The DDL generator emits these fields automatically for every tenant table. Discipline is enforced by tooling, not by code review.

## 4.2 Generated artifact schema (detail)

Beyond the universal metadata, Generated Artifacts carry additional provenance fields that capture the full chain from input to output. This schema was previewed in Section 3.6; here it is documented in detail with the rationale for each field.

**Prompt provenance**

prompt\_template\_id and prompt\_template\_version together identify exactly which prompt produced this artifact. Templates evolve; without versioning, you cannot answer "did changing the prompt last month help or hurt performance."

**Model provenance**

model\_used identifies the specific model and version. model\_parameters captures temperature, max\_tokens, and any other generation-time parameters. This lets you compare model performance across the same prompt, and revisit underperforming model choices six months later.

**Input provenance**

input\_record\_ids is an array of UUIDs pointing to the source data the artifact was generated from. This is the join that lets queries answer "what kind of inputs produced the best outputs." Without it, you have only the artifact itself and no way to learn from its lineage.

**Human-in-the-loop tracking**

human\_reviewed (boolean) and human\_edits (diff or full edit) capture whether and how a human modified the AI output before dispatch. This is critical for two reasons: it allows fine-tuning datasets to use only artifacts that survived human review without edits, and it allows the system to learn what humans tend to change about its output.

**Outcome forward-attribution**

outcome\_id and outcome\_score are nullable at creation time and filled in later when outcomes are measured. The forward-attribution path (artifact → interaction → outcome) is one of the most important query patterns in the system.

## 4.3 Outcome attribution rules

Capturing outcomes is the hardest part of the moat strategy because outcomes are often delayed, ambiguous, or multi-causal. The following rules govern how outcomes are recorded and attributed to causes.

**When to measure**

Outcomes are measured at predefined intervals after the causing event:

  - Immediate outcomes: within 24 hours. Email reply received, payment cleared, access revoked.

  - Short-term outcomes: 7 to 30 days. Engagement uptick after re-outreach, content piece performance.

  - Medium-term outcomes: 60 to 120 days. Renewal decision, board approval cycle.

  - Long-term outcomes: at the next renewal cycle or 12 months, whichever comes first.

**Who measures**

Three measurement methods are valid:

  - MANUAL\_LOG: a human records the outcome (a staff member logs that a renewal was signed).

  - AUTOMATED\_DETECTION: a system detects the outcome (payment cleared in Stripe, email reply received via inbound webhook).

  - INFERRED: an agent or rule derives the outcome from related signals (engagement appears to have improved based on Interaction frequency).

INFERRED outcomes carry confidence \< 1.00 and are clearly flagged. They are usable for trend analysis but not for hard ROI claims.

**Multi-outcome attribution**

A single Decision or Interaction can produce multiple Outcomes over time. A renewal Decision produces an immediate financial Outcome (revenue booked), short-term engagement Outcomes (event attendance during the year), and a long-term Outcome at the next renewal (renewed again or not). All three Outcomes reference the same caused\_by\_decision\_id, with attribution\_share splitting the financial value if needed.

**Ambiguous outcomes and attribution\_share**

Some causal chains produce ambiguous outcomes. A member receives outreach, attends an event two weeks later, and renews three months later. Is the renewal attributable to the outreach, the event, or both? Both. Multiple Outcomes can be created, one caused\_by\_interaction\_id pointing to the outreach, one pointing to the event.

If those two Outcomes each carried the full $5,000 financial\_value, naive aggregation queries would report $10,000 for a single real-world renewal. The attribution\_share field prevents this. The two Outcomes share the value: 0.50 and 0.50 by default, or weighted (0.70 for outreach, 0.30 for event) based on causal evidence. All ROI queries are written as SUM(financial\_value \* attribution\_share), which correctly returns the real-world total.

Single-cause outcomes default to attribution\_share = 1.00, so the math is consistent regardless of how the outcome was attributed. The discipline this imposes on outcome writers is correct: forcing the question "is this the only cause?" at write time produces better data than letting downstream analytics paper over double-counting.

**No-signal outcomes**

Some causal chains never produce a clean outcome. An outreach goes out and the member never responds. After 90 days with no signal, the system records a NO\_RESPONSE Outcome with confidence 1.00 and outcome\_score 0. This is not a failure to measure. It is an explicit measurement of absence, and it feeds the learning loop just like positive outcomes do.

> The discipline this section requires is high. Teams that skip outcome attribution end up with rich interaction data and no way to learn from it. The cost of doing this well at write time is moderate. The cost of retrofitting it later is catastrophic. Make outcome attribution part of definition-of-done for every feature that produces or processes Generated Artifacts.

## 4.4 Audit trail design

The system maintains three kinds of audit information: write-side history (what was created, updated, deleted, by whom and when), read-side access logs (who looked at what, when, with what query), and redaction events (when PII was removed in response to legal requests).

**Write-side: hybrid event-sourcing with redaction tombstones**

Different entities use different audit patterns based on their importance to institutional memory:

  - **Event-sourced (append-only):** Party, Membership (via State\_Event), Decision. Updates produce new rows; original rows are never modified. Current state is materialized from event log.

  - **Structurally immutable, content-redactable:** Interaction. The structural facts (party, channel, direction, timestamps) are immutable. PII content fields (body\_excerpt, certain metadata keys) can be redacted by a compliance process, with the redaction event itself logged.

  - **Audit-logged (mutable with history):** Signal, Outcome, Generated\_Artifact. Records can be updated, but every change is captured in Audit\_Log with before/after values. version field increments on update.

Tradeoff: full event sourcing for every entity is engineering overkill at Aloomii's current scale. Event sourcing the entities that contribute to institutional memory captures the moat-critical history without imposing event-sourcing complexity on operational data.

**The redaction tombstone pattern**

When a tenant exercises a PIPEDA, GDPR, or similar right-to-be-forgotten request against a specific Party, the system performs a structured redaction rather than a deletion. The procedure:

  - Verify the request's legal basis and scope.

  - Identify all Interactions where the Party's PII appears in body\_excerpt or metadata.

  - Replace PII content with \[REDACTED-PII\] tombstones, preserving structural fields (timestamps, channel, party\_id, type).

  - Apply the same redaction to any Generated Artifacts that referenced the Party's PII.

  - Record the redaction action as an Audit\_Log entry with actor, scope, and legal basis.

  - Optionally, fully delete the Party record if the request requires it. References from other tables become null (the tombstone preserves the structural relationship).

The pattern reconciles the immutability principle (institutional memory persists; the fact of interactions cannot be denied) with the legal requirement that personal data be removable on request. Structural scaffolding survives. Personal content does not.

**Read-side: tiered logging**

Read operations against tenant data are logged in two tiers based on their security relevance:

  - **Security-relevant reads in Postgres Audit\_Log:** Data exports, bulk queries (over a configurable row threshold), cross-tenant query attempts, off-hours staff access, and access by external API clients. These need to be joinable to other tenant data during investigations, which is why they stay in the transactional database. Logged at 100%.

  - **Operational reads in external log storage:** Routine queries like member-list lookups, signal queries, report renders. Streamed from the application layer directly to S3+Athena or ClickHouse, bypassing Postgres entirely. Sampled at 5% by default, configurable per tenant.

This split avoids the WAL churn and storage bloat that would result from writing all read events to Postgres, while still preserving the investigation-grade audit trail for the events that actually matter. The tradeoff is that operational read patterns require cross-system joins during anomaly investigation, but those queries are rare enough that the cost is acceptable.

**Retention**

Audit data retention is configurable per tenant and per vertical. Default: 7 years for write-side audit and security-relevant reads, 90 days for operational reads in external storage. Retention extension is available for regulated verticals (real estate boards, professional licensing organizations) at additional cost reflecting storage and compliance overhead.

# 5. Tenant isolation architecture

## 5.1 Threat model

Before specifying an isolation strategy, the threats it must defend against are enumerated explicitly. The chosen strategy is evaluated against each threat in the following section.

**Threats in priority order**

**T1. Accidental cross-tenant leak in AI prompts.**

Highest-likelihood failure mode. An agent operating in tenant A's context inadvertently includes tenant B's data in its prompt or output. This would be a privacy catastrophe and a contract breach. Mitigation must be structural, not policy-based.

**T2. Engineering query error.**

A developer writes a query that omits the tenant\_id WHERE clause and returns data across tenants. Common in row-level multi-tenant systems. Mitigation: queries cannot reach other tenants' data because the data lives in different schemas.

**T3. Vector store / embedding leakage.**

Embeddings stored in a shared vector database surface across tenants on similarity search. Subtle and easy to miss in code review. Mitigation: vector stores partitioned per-tenant; cross-tenant similarity queries are not possible.

**T4. Compromised credentials.**

A tenant's credentials are stolen. The blast radius depends entirely on isolation level. Mitigation: stolen credentials grant access only to the compromised tenant's data, by structure.

**T5. Insider threat.**

An Aloomii employee or contractor accesses tenant data outside legitimate work. Mitigation: full read-side audit logging, anomaly detection, principle of least privilege for staff access.

**T6. Subpoena, discovery, or data export.**

If one tenant is sued or asks to leave, can Aloomii produce only their data, cleanly, without leaking adjacent tenants? Mitigation: schema-level isolation makes this trivial; row-level isolation makes it hard.

**T7. Connection pool search\_path leakage.**

Schema-per-tenant on Neon relies on PgBouncer connection pooling. PgBouncer in transaction-pooling mode does not reset session-level state like search\_path between requests. If application code executes SET search\_path = 'crcc' on a borrowed connection and returns it to the pool without resetting, the next request, possibly for tenant B, can execute against CRCC's schema. This is a subtle but catastrophic threat unique to pooled-connection deployments.

Mitigation, enforced at the code level: application code MUST either use fully-qualified table names (SELECT \* FROM crcc.party) as the default pattern, OR confine any SET search\_path to SET LOCAL inside an explicit BEGIN...COMMIT transaction so Postgres resets it automatically on commit. Linting rules and code review catch the rare violations. Fully-qualified names is the strongly preferred pattern; SET LOCAL is reserved for cases where the schema name is genuinely dynamic and unknown at query-construction time.

## 5.2 Chosen strategy: schema-per-tenant

Aloomii's tenant isolation strategy is schema-per-tenant within a shared Postgres database (running on Neon). Each customer organization gets a dedicated Postgres schema containing all their tables. Cross-schema queries are technically possible but must be explicit, named, and reviewable. They cannot happen by accident in the way row-level isolation makes possible.

**Why this strategy**

  - **Strong isolation by structure.** Threats T1, T2, T3, T4, and T6 are largely defanged by structure rather than discipline. A query against the wrong schema fails loudly rather than returning cross-tenant data silently. T7 (connection pool leakage) is the one threat where structural isolation alone is insufficient and code-level patterns are required (see T7 mitigation in Section 5.1).

  - **Manageable operational complexity.** Schema-per-tenant scales well to several thousand tenants on a single Postgres instance. Aloomii will not approach that limit in the relevant planning horizon.

  - **Clean migration and export.** Data export, deletion, and tenant offboarding are schema-level operations. "Export this tenant's data" is pg\_dump --schema=\<tenant\_schema\>. "Delete this tenant" is DROP SCHEMA. T6 is structurally easy.

  - **Compatible with cross-tenant learning.** Pattern extraction runs as a scheduled process that reads from each tenant schema, anonymizes, and writes aggregates to a separate database. The isolation is preserved while learning still happens.

  - **Reasonable migration path if needs change.** Migrating to database-per-tenant later (for a regulated customer requiring it) is feasible. Migrating to row-level isolation later is not, and would be a step backward.

**Rejected alternatives**

**Row-level isolation (shared schema with tenant\_id columns).**

Rejected. The risk of T2 (a forgotten WHERE clause) is unacceptably high. Postgres row-level security policies can mitigate this but are easy to misconfigure and provide weaker isolation than schema separation. The cost saving is not worth the increased blast radius.

**Database-per-tenant.**

Rejected for current scale. Strongest isolation, highest operational cost. Schema migrations across hundreds of databases are painful. Per-tenant database costs add up quickly on Neon's pricing model. Reserved as an option for specific customers (sensitive verticals, regulated industries) at premium pricing where it is justified.

**Hybrid (shared schema for most customers, dedicated DB for a few).**

Rejected as the default but available as an option. Two operational models doubles the engineering surface area. Better to standardize on schema-per-tenant and elevate specific customers to database-per-tenant only when contractually required.

## 5.3 Cross-tenant learning pipeline

The hardest architectural challenge is allowing cross-tenant pattern learning (Moat 1) while preserving the structural privacy guarantees of schema-per-tenant isolation. The solution is a one-way pipeline with strict anonymization at the boundary.

**Pipeline stages**

**Stage 1: Per-tenant extraction.**

A scheduled job runs in each tenant schema, extracting candidate records for pattern learning. Examples: closed-out Decisions with measured Outcomes, dispatched Generated Artifacts with response data, completed Membership lifecycles. The extraction is read-only and audit-logged.

**Stage 2: Anonymization.**

Extracted records are transformed: PII removed (names, emails, phone numbers, addresses), entity IDs replaced with consistent hashes that do not allow back-tracing to the source tenant, specific dates converted to relative offsets ("90 days after membership start"), free-text fields summarized to category labels by an anonymization classifier.

**Stage 3: k-anonymity validation.**

Anonymized records are batched and validated against a k-anonymity threshold. A record is included in the pattern pipeline only if there are at least k other records in the batch that match it on quasi-identifying attributes (vertical, tier, geographic region category, organization size bracket). k = 5 for low-sensitivity patterns, k = 20 for sensitive patterns. Records below threshold are dropped, not retained.

**Stage 4: Aggregate computation.**

Validated anonymous records are aggregated into Pattern rows. Patterns describe statistical relationships, not individual records. Example: "For chamber members in the small-business tier, members who received re-engagement outreach within 30 days of a churn signal renewed at 73% (n=412, k=5)." Individual records are not retained beyond aggregation; only pattern coefficients and sample sizes are stored.

**Stage 5: One-way delivery.**

Pattern outputs are made available to per-tenant systems as a read-only derived data product. Per-tenant systems can query patterns to inform their own decisions and recommendations. Patterns never carry back-references to source tenants. The pipeline is strictly one-directional: tenant → patterns, never patterns → tenant data.

> Architectural invariant: there is no SQL connection, foreign key, or application path from the patterns database to any specific tenant's records. The patterns layer is a read-only derived data product that any tenant can consume but no tenant can be traced from. This invariant is enforced by database-level separation and by code-level review of the pipeline.

**Pipeline failure modes**

  - **Insufficient k.** Aloomii's earliest customers will have small enough cohorts that k=5 or k=20 thresholds are sometimes not met. Patterns simply don't compute until enough data accumulates. This is correct behavior. Cross-tenant learning is not available at scale-of-one or scale-of-two; that's the cost of doing this safely.

  - **Re-identification risk.** In theory, sufficient auxiliary data could allow re-identification of anonymized records. Mitigation: quarterly review of k-anonymity thresholds, conservative initial defaults, willingness to raise k as the system scales and risk profile evolves.

  - **Pipeline lag.** Pattern outputs reflect data from extraction time, not real time. Patterns are versioned and dated; consumers know they are working with derived data that may be days or weeks stale. This is acceptable for the use cases (broad pattern recognition, not real-time decision input).

## 5.4 Migration and export procedures

Tenant lifecycle operations (onboarding, exporting, deleting) are structurally simple under schema-per-tenant isolation. Documenting them explicitly here ensures they are repeatable, scriptable, and auditable.

**Tenant onboarding**

Procedure (automated):

  - Insert row into public.tenant with new UUID, name, vertical, schema\_name (derived from short\_name).

  - CREATE SCHEMA \<schema\_name\>.

  - Run schema DDL generator to create all canonical tables in the new schema.

  - Apply tenant-specific configuration (vertical-specific metadata defaults, tier definitions, initial agent fleet config).

  - Generate tenant credentials and provision API access.

  - Audit-log the onboarding event.

Total time: under 5 minutes. Fully scriptable. No manual database operations.

**Tenant data export**

Procedure for full export (e.g., customer request, regulatory request, contract end):

  - Run pg\_dump --schema=\<schema\_name\> to produce a complete SQL dump.

  - Generate CSV exports per table for human-readable delivery.

  - Generate JSON exports preserving relationships for re-importable form.

  - Compute hash digests for integrity verification.

  - Deliver via secure channel with explicit access controls and time-limited URLs.

  - Audit-log the export event with all delivered file hashes.

Total time: scales with tenant data size, typically under 1 hour for a chamber-sized tenant. Cross-tenant contamination is structurally impossible.

**Tenant data deletion**

Procedure for full deletion (e.g., right to be forgotten, contract termination):

  - Verify deletion authorization (board approval, contract termination, regulatory order).

  - Generate final export per export procedure above and deliver to tenant.

  - Mark tenant status as PENDING\_DELETION in public.tenant.

  - Wait configurable cooling-off period (default 30 days, configurable per contract).

  - DROP SCHEMA \<schema\_name\> CASCADE.

  - Remove tenant from active patterns pipeline.

  - Update public.tenant status to ARCHIVED, retain row for audit history.

  - Audit-log the deletion event.

Note: contributions this tenant made to the aggregate patterns layer remain in place. Those contributions are already anonymized and cannot be traced back to the deleted tenant. This is documented in the customer contract.

**Selective access for compliance**

If a tenant is subpoenaed and Aloomii must produce only their data:

  - Subpoena scope review by legal counsel.

  - pg\_dump --schema=\<tenant\_schema\> with appropriate filters.

  - Manual review of dump to confirm no cross-tenant data is present (structurally impossible but verified anyway).

  - Delivery to subpoenaing party through legal counsel.

  - Audit-log the compliance event.

# 6. Reasoning and rejected alternatives

This section captures the why behind major decisions. Six months or six years from now, when a contributor wonders why the schema is shaped this way, this is the answer. Architectural decisions that are not documented with reasoning get relitigated; ones that are documented can be revisited deliberately when conditions change.

**Why decompose Party / Membership / State\_Event**

Most CRMs collapse all three into a single "Member" table with a status field. This works for the first six months and breaks in a dozen ways thereafter. A Party can hold multiple Memberships across time (lapsed and reinstated) or across types (sponsor and member). An organization can have multiple contact persons over time. A status field cannot capture the why or when of transitions; it only captures the current state and discards everything else.

The three-way decomposition costs roughly 30% more upfront engineering effort and pays back permanently in flexibility, history capture, and analytics power. This is the central architectural insight of the document and the one that most differentiates Aloomii from competitor systems.

**Why event sourcing for Decisions but not for Interactions**

Decisions are the load-bearing entity for institutional memory (Moat 2). Their history must be perfectly preserved. Event sourcing for Decisions is non-negotiable.

Interactions, by contrast, are extremely high-volume and operationally focused. Full event sourcing for every Interaction edit would double the storage cost and add query complexity for marginal benefit. Audit-log-with-versions captures enough history for compliance and debugging without the full event-sourcing overhead. This is a deliberate, asymmetric choice.

**Why polymorphism through metadata, not through vertical-specific tables**

An obvious alternative: create chamber\_member, real\_estate\_agent, professional\_association\_member as separate tables, each with their own vertical-specific fields. Rejected for two reasons. First, the canonical schema becomes unstable as new verticals are added. Every new vertical requires schema migrations, code changes, and analytics rework. Second, cross-vertical pattern learning becomes vastly harder because the underlying types don't align.

Polymorphism through metadata keeps the canonical schema stable and the cross-vertical learning straightforward, at the cost of slightly heavier JSONB usage and per-vertical metadata-schema discipline. The tradeoff favors the canonical model heavily.

**Why a separate Generated\_Artifact entity instead of folding into Interaction**

An obvious alternative: an Interaction with channel=AI\_GENERATED captures everything a Generated Artifact captures. Rejected because Interactions are immutable point-in-time facts, but AI outputs go through a draft → review → edit → send lifecycle that requires mutability. Mixing the two would either compromise Interaction immutability or constrain artifact workflow.

Keeping Generated\_Artifact separate also makes it possible to retain artifacts that were never dispatched (drafts a human discarded), which is valuable training data that would be lost if everything had to become an Interaction first.

**Why schema-per-tenant over row-level isolation**

Already documented in Section 5.2. The short version: row-level isolation depends on developer discipline (never forgetting tenant\_id in WHERE clauses) to maintain privacy guarantees. Schema-per-tenant enforces isolation structurally. Privacy guarantees enforced by structure are dramatically more durable than guarantees enforced by discipline.

**Why k-anonymity for cross-tenant learning instead of differential privacy**

Differential privacy provides stronger mathematical guarantees but adds significant implementation complexity and degrades utility for the kinds of pattern learning Aloomii needs (recommendation, benchmarking, signal tuning). At Aloomii's scale and risk profile, k-anonymity with conservative k thresholds provides adequate privacy with much better utility and lower implementation cost. Reserved as a future enhancement if a customer or regulator requires it.

# 7. Implementation roadmap

This document specifies an architecture. The implementation rollout is phased to align with Aloomii's actual customer trajectory.

**Phase 1: CRCC build (months 1-3)**

Goal: implement the canonical schema for the first tenant. Validate that the schema supports a real chamber workload.

  - Build the Tenant table and provisioning scripts.

  - Implement schema-per-tenant DDL generator producing all canonical tables with provenance fields.

  - Provision the CRCC schema and onboard their data.

  - Implement application-layer access patterns for Party, Membership, State\_Event, Interaction.

  - Defer Generated\_Artifact, Signal, Decision, Outcome to Phase 2. Capture data in basic form first.

  - Defer cross-tenant patterns layer entirely; CRCC is the only tenant in this phase.

**Phase 2: CRCC operations (months 3-9)**

Goal: implement the moat-building entities (Decision, Outcome, Generated\_Artifact) and prove they produce useful institutional memory and learning loops.

  - Implement Signal generation rules and the agent that produces Signals.

  - Implement Decision workflow with full reasoning, alternatives, and evidence capture.

  - Implement Outcome attribution with measurement methods and confidence.

  - Implement Generated\_Artifact with full provenance chain.

  - Validate that 6-month-old data in these tables actually produces useful retrospective insight ("why did we decide X back in June").

**Phase 3: Second tenant onboarding (months 9-12)**

Goal: prove the architecture scales to a second tenant cleanly. This is the test that the schema is canonical, not chamber-specific.

  - Onboard chamber \#2 (target: an Ontario chamber introduced via OCC network).

  - Validate that schema-per-tenant provisioning works as designed.

  - Validate that the vertical mapping document and metadata schema cover the second chamber's surface differences.

  - First retrospective on what should change in the canonical model based on real second-tenant experience.

**Phase 4: Cross-tenant patterns (months 12-18)**

Goal: with 2-3 tenants live, build the cross-tenant learning pipeline.

  - Implement the anonymization stage with vertical-specific PII rules.

  - Implement k-anonymity validation with initial k=5 threshold.

  - Implement pattern aggregation for the first 3-5 pattern types (churn precursor, engagement lift, renewal predictor).

  - Implement read-side consumption: per-tenant systems consume patterns through a controlled API.

**Phase 5: Vertical expansion (months 18-24)**

Goal: extend the architecture to a second vertical. Validate that the canonical model truly is canonical.

  - Onboard first non-chamber tenant (target: a professional association or real estate board).

  - Document any architectural changes required and ensure they preserve backward compatibility.

  - Validate cross-vertical pattern learning produces meaningful insight.

# 8. Open questions

Several open questions from v1.0 were resolved during peer review and are documented here as resolved decisions, marked \[RESOLVED v1.1\]. The remaining open questions still require resolution before or during the noted implementation phase.

**Resolved during v1.1 peer review**

  - **\[RESOLVED v1.1\] UUID generation strategy.** Use uuid\_generate\_v7() for time-ordered UUIDs. Generation happens in application code (Node, Python) right before INSERT, not via Postgres default expressions. This dramatically reduces B-tree index fragmentation compared to v4 randomness and gives backend code the ID instantly, simplifying multi-table nested inserts (Artifact + Interaction + Outcome).

  - **\[RESOLVED v1.1\] Vector store choice.** pgvector inside each tenant schema. Structural isolation guarantees that one tenant's embeddings cannot leak into similarity searches against another tenant, perfectly addressing T3. External vector databases (Pinecone, Qdrant) would require application-level metadata filtering, weakening the isolation moat.

  - **\[RESOLVED v1.1\] current\_status\_cache refresh strategy.** Use a database trigger AFTER INSERT ON State\_Event that updates the current\_status\_cache column on Membership. Native Postgres MATERIALIZED VIEW is rejected because its refresh requires heavy read locks. Trigger-based update keeps the cache fresh transactionally with no blocking.

  - **\[RESOLVED v1.1\] Patterns database location.** Same Neon project, different logical database (or a heavily restricted public\_patterns schema in a separate database). The patterns layer is entirely outside the connection string and IAM scope of the API workers that handle standard per-tenant traffic. This preserves the one-way pipeline invariant from Section 5.3.

  - **\[RESOLVED v1.1\] Tenant configuration hierarchy.** Rely on strong code-level defaults. Shared vertical defaults live in code or a public.vertical\_configuration table. The metadata JSONB column on public.tenant is used only when a specific tenant explicitly overrides the default. This minimizes per-tenant configuration surface area and aligns with Principle 2.5.

**Still open: pre-implementation (resolve before Phase 1)**

  - Encryption-at-rest configuration on Neon. Default Neon encryption may be sufficient for the verticals Aloomii will serve initially. Verify against actual contracts before CRCC's data lands.

  - Application-layer ORM choice and how it interacts with the fully-qualified-table-names pattern required by T7 mitigation. Specifically: does the chosen ORM auto-prepend a schema or require manual qualification? This drives coding-standard documentation.

**Still open: during Phase 1-2 (resolve during CRCC implementation)**

  - Final list of canonical signal\_types, decision\_types, outcome\_types, and interaction\_types. Initial enumeration starts in this doc but needs ratification before code is written.

  - Exact JSON schema for the metadata blocks on each entity. Vertical-specific schemas live separately; need the JSON schema versioning approach (semver in the JSON itself, or external migration tracking).

  - Specific PII detection rules used by the redaction tombstone process (Section 4.4). Initial scope: names, emails, phone numbers, physical addresses. Vertical-specific PII (license numbers, government IDs) handled per vertical.

  - Read-side operational log storage choice: S3+Athena, ClickHouse, or Datadog. Driven by team familiarity and query patterns rather than raw cost.

**Still open: during Phase 3-4 (resolve during second-tenant onboarding)**

  - Pattern API design: REST, GraphQL, or direct SQL access to a read-only views layer? Driven by who consumes the patterns and how often.

  - Final k-anonymity thresholds per pattern type, calibrated against the actual cohort distribution at 3+ tenants. The Section 5.3 defaults (k=5 for low-sensitivity, k=20 for sensitive) are starting points that may need to be raised before patterns are made available to per-tenant consumers.

**Still open: strategic (resolve as the customer base evolves)**

  - At what point does database-per-tenant become an offered option for premium customers? Triggers: regulatory requirement, contractual requirement, or a customer in a sensitive enough vertical to justify it.

  - When does Aloomii consider migrating to a managed Postgres service with native multi-tenant features? Currently Neon is sufficient; revisit at 25+ tenants.

  - When do operational entities (Signal, Interaction) need to scale beyond a single Postgres instance? Probably not relevant before 50+ tenants; document the migration path anyway.

  - Phase 2 refinement: should Decision.reasoning evolve from a freeform TEXT field into a structured JSONB with controlled vocabulary? Worth evaluating once 6-12 months of actual reasoning records exist to inform what taxonomy emerges naturally.

# 9. Change log

This document evolves deliberately. Every revision captures both what changed and why, so future contributors can understand the reasoning rather than relitigating settled decisions.

**v1.2 (May 2026) - CRM-completeness revision**

Adds two architectural additions that close the gap between the membership-organization use case and full CRM completeness. Both additions are deliberate, scoped, and preserve the lean architecture. The strategic direction does not change. Aloomii is not pivoting to be a CRM; the architecture happens to subsume the CRM use case as a consequence of being built right for relationship-driven organizations more broadly.

**Architectural additions**

  - **Section 3.9: Task entity.** Forward-looking work as a first-class entity. Required to support traditional CRM workflows (sales pipelines, follow-up management, AI-agent task generation) without compromising the membership-organization use case. Task closes the loop between intention (Task) and historical fact (Interaction) via completed\_as\_interaction\_id, which is the central feature that distinguishes this architecture from generic to-do systems. Human vs. agent provenance is structurally captured through the created\_by prefix convention (user:/agent:/system:) and the exclusive arc between assigned\_to\_party\_id and assigned\_to\_agent\_id.

  - **Section 3.10: Opportunity / Deal documented as future addition.** Sales Opportunity is deliberately not a first-class entity in v1.2. The Decision entity in PROPOSED status absorbs the use case for now and provides better institutional memory than a typical CRM Opportunity field. The migration path to a dedicated Opportunity entity is documented for the future case where a customer's workflow requires native forecasting and high-velocity pipeline features. The trigger to add it is customer demand, not architectural anticipation.

**Entity count**

The canonical entity model now spans eight entities: six core relationship entities (Party, Membership, Interaction, Signal, Decision, Outcome) plus Generated Artifact for AI provenance and Task for forward-looking work. Updated references throughout the document.

**CRM positioning note**

Even with full CRM completeness now structurally supported, the document continues to recommend against external positioning that leads with the "CRM" frame. The architecture supports CRM use cases as a consequence of being built right. The product is institutional intelligence infrastructure; CRM is a feature of the moat, not the other way around. Section 3.10 expands on this commercial positioning point.

**v1.1 (May 2026) - Post-peer-review revision**

Integrates feedback from external peer review of v1.0. Five database-correctness issues, three operational refinements, and resolved several open questions. No principles changed; the architecture's strategic direction is intact. The changes tighten enforcement around the principles v1.0 already committed to.

**Critical database corrections**

  - **Sections 3.3, 3.4, 3.5, 3.6:** Replaced polymorphic subject\_type ENUM + subject\_id UUID pattern with the exclusive-arc pattern (nullable typed FKs governed by a CHECK constraint requiring exactly one non-null). Postgres cannot enforce referential integrity on the original pattern. Affects Signal, Decision, Outcome, and Generated\_Artifact. Rationale: Principle 2.1 requires structural enforcement; the original pattern relied on application discipline.

  - **Section 3.6:** Changed Generated\_Artifact.input\_record\_ids from UUID\[\] to a JSONB array of structured entity references like \[{"entity": "Signal", "id": "uuid"}\]. Preserves table provenance so an engineer querying the artifact's lineage knows which table each ID belongs to without guessing. Cost is minor (slightly larger column size, marginally more parsing); benefit is significant (correct lineage reconstruction).

  - **Section 5.1:** Added T7 (connection pool search\_path leakage) to the threat model. PgBouncer in transaction-pooling mode does not reset search\_path between requests, creating a leakage path that schema-per-tenant isolation alone does not address. Mitigation is code-level: fully-qualified table names as the default pattern, with SET LOCAL search\_path confined to transaction blocks when dynamic naming is required.

**Operational refinements**

  - **Section 3.5 and 4.3:** Added attribution\_share DECIMAL(3,2) to Outcome. Resolves a double-counting risk in ambiguous-outcome scenarios where a single real-world event (such as a renewal) is attributed to multiple causes. ROI queries use SUM(financial\_value \* attribution\_share) to compute correct totals. Default value 1.00 for single-cause outcomes preserves backward compatibility with simple aggregations.

  - **Section 3.2 and 4.4:** Reconciled the Interaction immutability rule with PIPEDA/GDPR right-to-be-forgotten requirements. Documented the tombstone/redaction pattern: structural facts (party, channel, timestamps, type) are immutable; PII content (body\_excerpt and certain metadata) is redactable by a compliance process that itself produces an Audit\_Log entry. Pure immutability would have made Aloomii non-compliant in Canada and the EU.

  - **Section 4.4:** Split read-side audit logging into two tiers. Security-relevant reads (exports, bulk queries, cross-tenant attempts, off-hours access, external API access) stay in Postgres Audit\_Log at 100% logging because they need to be joinable to other tenant data during investigations. High-volume operational reads stream from the application layer directly to external log storage (S3+Athena or ClickHouse) at 5% sampling. This avoids the WAL churn and storage bloat that full read logging in Postgres would have caused.

  - **Section 3 throughout:** Corrected entity count. The document now consistently describes seven entities (six canonical plus Generated\_Artifact as the seventh, for AI provenance). The v1.0 inconsistency between "six entities" and the seven-item list was a writing error, not a model change.

**Open question resolutions**

Five open questions from v1.0 Section 8 were resolved during peer review and are now documented as resolved decisions: UUIDv7 generation in application code, pgvector inside tenant schemas, trigger-based current\_status\_cache refresh, patterns database location in same Neon project but different logical database, and tenant configuration hierarchy with strong code-level defaults. See Section 8 for the full reasoning behind each resolution.

**v1.0 (May 2026) - Initial foundation**

First complete version of the canonical data architecture. Defines the seven core entities, provenance and outcome plumbing, tenant isolation strategy via schema-per-tenant on Neon, and the cross-tenant learning pipeline. Authored ahead of CRCC implementation to ensure foundational architectural decisions are made deliberately rather than emerging accidentally during the build.

*This document is the foundation of Aloomii's engineering practice. It is intended to be revised, but deliberately, with reasoning preserved, and with version history retained. The current version is v1.2. Subsequent versions should preserve the rationale sections, mark changes explicitly in the Change Log (Section 9), and be approved by both founders before adoption.*

*End of document.*

