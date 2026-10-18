# Overview

Explore future revenue and support options while keeping ScratchLab's core
learning path accessible. This document records concepts, not a decision to
build a payment system.

See the [product vision](../vision.md), [roadmap](../roadmap.md), and
[v1.0 milestone](../milestones.md).

# User Story

As a learner or supporter, I want optional ways to access additional practice
content or support ScratchLab, while the core learning experience remains useful
without payment.

# Functional Requirements

- Evaluate these content packs:
  - Beginner Pack
  - Intermediate Pack
  - Battle Scratch Pack
  - DMC Practice Pack
  - Advanced Flare Pack
- Evaluate Pro Analysis for detailed statistics, growth analysis, and difficulty
  insights.
- Evaluate a Supporter Plan as an optional way to support the project.
- Keep monetization optional and do not block the core learning path.
- Do not collect payment, add account requirements, or promise paid access until
  a separate product and architecture decision is approved.
- Before implementation, define pricing, entitlement, content boundaries,
  cancellation/refund handling, privacy, support, and operational ownership.

# UI Requirements

- Clearly distinguish available free content from concepts or offerings that are
  not yet available.
- Do not show misleading purchase controls or imply that payment unlocks
  unavailable content.
- Explain what an offering provides before any future purchase flow.
- Keep support actions optional and separate from practice controls.

# Data Model

No payment, account, or entitlement data is defined by this concept spec.
Initial product behavior remains serverless and local. If a paid offering is
approved, decide how access can be verified and how personal/payment data is
handled before choosing a data model. Do not store sensitive payment details in
LocalStorage.

# Acceptance Criteria

- All seven concepts are evaluated: five packs, Pro Analysis, and Supporter
  Plan.
- A free learning path remains usable without an account or purchase.
- No offering is described as available until its delivery and support model
  exist.
- Any move to implementation includes explicit decisions on payment,
  entitlements, privacy, and the consequences for static GitHub Pages hosting.

# Future Extensions

- Curated content catalogs and optional creator-contributed packs.
- One-time content purchases or a supporter contribution, subject to a
  documented operating model.
- Additional analysis capabilities as defined in
  [timing analysis](timing-analysis.md).
