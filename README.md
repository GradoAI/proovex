# Proovex

English | [简体中文](./README.zh-CN.md)

Prove what your agents actually did.

Proovex is an open, pluggable Evidence Runtime for AI agents.

Capture real agent actions, observe their effects, and independently verify what actually happened.

**Status: Early productization / incubation. A standalone implementation is not yet available.**

![Proovex — Agent Action → Evidence → Verification → Trusted Outcome](./assets/proovex-hero.svg)

## What is Proovex

Proovex is Evidence and verification infrastructure for AI agents. Its intended role is to connect each Run with what the agent did, what changed in the real system, and what independent Verification can establish.

## Why Proovex

Agent output is a claim. Proovex turns agent execution into verifiable Evidence.

AI agent evidence should connect an action to its observed side effects and a Verifier's result. That makes agent verification useful beyond self-reported success—for agent evaluation, agent security, and AI agent audit.

## Evidence vs Trace

A trace typically describes execution paths and timing, and can contain useful Evidence. A tool-call record alone does not establish that the target system actually changed as intended.

Proovex aims to connect action records, independent observations, provenance, and explicit assertions. Verification establishes only what the available Evidence supports for that assertion; it does not establish that an entire system is safe or that every side effect was observed.

## What can I prove? A concrete example

**Conceptual example—not a run result, runnable sample, or formal schema.** Suppose an agent claims it saved a report to a specified path:

| Step | Required basis |
|---|---|
| Claim | The agent reports “file saved” |
| Action | A request to write the specified path, associated with the same Run |
| Independent observation | Read the target file after the action; record source, time, and content digest |
| Evidence | Associate the write request, observation, and file artifact while preserving their origins |
| Verification | A Verifier checks whether the observed content digest matches the expected digest |
| Result boundary | A match supports only the content assertion; a mismatch should fail; a missing trusted observation stays unknown |

“Trusted Outcome” means a specific conclusion backed by traceable Evidence, not blanket trust in an agent.

## Core Flow

```text
Capture → Normalize → Store → Verify → Query
```

Collectors capture Evidence; Verifiers assess it independently. The flow preserves the distinction between an agent's claim and an observed effect. Missing Evidence remains unknown, not an implied success.

## What Proovex captures

The intended capture scope includes:

- Actions
- Observations
- State changes
- Side effects
- Artifacts
- Verification results

These are the target Evidence categories, not a claim that standalone Collectors have shipped.

## Who it is for

- AI agents, including coding, browser, and MCP agents
- RPA and computer-use automation (CUA)
- Evaluation, security, governance, and audit integrations

## Intended use cases

These are planned experiences, not currently available features:

- **Coding agents: did the file actually change?** Connect a write action to independently observed file content and verify an explicit content assertion.
- **Browser agents / RPA / CUA: did the action take effect?** Inspect the resulting state rather than treating a click or successful tool response as proof of the outcome.
- **Evaluation, security, and audit: what supports the conclusion?** Query a Run's Evidence and Verification results, distinguishing self-report, observed facts, and remaining unknowns.

## Principles

- Vendor neutral
- Pluggable
- Independent observation
- Verifiable by default
- Evidence over self-report

## Current Status

**Early productization. You cannot try a standalone runtime yet.** This repository contains the product definition and roadmap, with no runnable SDK, CLI, API, or Quick Start.

Proovex was incubated from evidence, trust, verification and evaluation capabilities developed in grado-companion-kit.

Standalone code extraction requires a separate decision and Work Item; this repository does not maintain a parallel runtime implementation. The experiences described here are targets, not shipped features.

“Open” means the intended integration surface.

The English README is the canonical product definition; the Chinese version is its accurate localization.

## Vision

Read the [Vision](./VISION.md) for the long-term direction, independence principles, and product boundaries. This document is currently in English.

## Roadmap

Read the [Roadmap](./ROADMAP.md) for the intended product stages and what remains outside the core runtime. This document is currently in English. No release dates are committed.

## License

Proovex is licensed under the Apache License 2.0. See [LICENSE](./LICENSE).
