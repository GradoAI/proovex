# Proovex

**Prove what your agents actually did.**

Proovex is an open, pluggable Evidence Runtime for AI agents.

Capture real agent actions, observe their effects, and independently verify what actually happened.

**Status: Early productization / incubation.** This repository establishes the standalone Proovex product boundary; a standalone implementation is not yet available.

## Why Proovex

Agent output is a claim. Proovex turns agent execution into verifiable evidence.

AI agent evidence should connect an Action to its observed Side Effects and a Verifier's result. That makes agent verification useful beyond self-reported success—for agent evaluation, agent security, and AI agent audit.

## Core flow

```text
Capture → Normalize → Store → Verify → Query
```

The intended Evidence flow connects each Run with Actions, Observations, State Changes, Side Effects, Artifacts, and Verification results. Collectors capture evidence; Verifiers assess it independently.

## Designed for

- AI agents, including coding, browser, and MCP agents
- RPA and computer-use automation (CUA)
- Evaluation, security, governance, and audit integrations

## Principles

- Vendor neutral
- Pluggable
- Independent observation
- Verifiable by default
- Evidence over self-report

## Current status

Proovex is being productized from capabilities incubated and validated in grado-companion-kit.

The current implementation remains in grado-companion-kit. This repository is the official product home and future standalone repository boundary, not a second implementation source. The capabilities above describe the product direction, not a claim that the standalone runtime has shipped.

Code extraction requires a separate extraction decision and Work Item. No runtime code is copied or maintained here in parallel.

“Open” describes the intended integration surface. No open-source license has been granted for this repository; the licensing strategy remains undecided.

- [Vision](VISION.md)
- [Roadmap](ROADMAP.md)
