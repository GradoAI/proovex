# Proovex Roadmap

This roadmap describes intended product stages, not released capabilities or promised delivery dates. Current status: early productization / incubation. Standalone runtime implementation has not been completed.

## Phase 0 — Product Boundary

- Establish the Proovex repository and product identity
- Reconcile capabilities incubated in grado-companion-kit
- Formalize a common Evidence model
- Freeze standalone contracts

Only the repository and product identity are established by this initialization. Model and contract work remains planned. Code extraction requires a separate extraction decision and Work Item; this repository must not become a parallel runtime implementation.

## Phase 1 — Evidence Core

- Run model
- Evidence schema
- SDK
- HTTP ingestion
- Evidence Store
- Artifact Store
- Deterministic Verification API
- Run / Evidence / Timeline query

### First verified Run milestone

A developer unfamiliar with Proovex must be able to complete a first verified Run in minutes: clone/install → start → ingest one Run → inspect Evidence → verify an assertion.

This milestone requires real commands, a runnable example, independently observed effects, and deterministic Verification outcomes for a matching assertion, a mismatch, and missing Evidence. Record the actual prerequisites, steps, and time during a fresh-user walkthrough; do not claim the experience is ready before it works.

Once a real MVP supports this path, both READMEs must replace the product-only introduction with the tested Quick Start. Until then, no install command, SDK, CLI, or API availability is implied.

## Phase 2 — Pluggable Collection

- MCP Collector
- OpenTelemetry ingestion
- Browser / CDP Collector
- Filesystem / process Evidence
- Basic desktop Evidence
- Source attribution

## Phase 3 — Standalone Proof

Demonstrate:

- One Grado producer
- One non-Grado producer
- The same Evidence model across both producers
- Independent Side Effect observation
- Deterministic Verification
- Standalone query / Verification

These demonstrations must produce inspectable Evidence. Incubation results alone do not establish standalone compatibility or completion.

## Phase 4 — Ecosystem

- Richer Collectors
- External Verifier interfaces
- Eval / Security integrations
- Portable Evidence bundles
- Ecosystem SDKs

## Later / not core

The following are outside the core runtime roadmap:

- Full Eval platform
- Red Team platform
- Workflow builder
- Agent builder
- Prompt management
- Full SIEM / compliance suite

No release dates are committed. Licensing remains undecided and requires an explicit licensing strategy before any license is added.
