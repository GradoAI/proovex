# Proovex

English | [简体中文](./README.zh-CN.md)

Prove what your agents actually did.

Proovex is an open, pluggable Evidence Runtime for AI agents.

Capture real agent actions, observe their effects, and independently verify what actually happened.

**Status: Early productization / incubation. A standalone implementation is not yet available.**

## What is Proovex

Proovex is Evidence and verification infrastructure for AI agents. Its intended role is to connect each Run with what the agent did, what changed in the real system, and what independent Verification can establish.

## Why Proovex

Agent output is a claim. Proovex turns agent execution into verifiable Evidence.

AI agent evidence should connect an action to its observed side effects and a Verifier's result. That makes agent verification useful beyond self-reported success—for agent evaluation, agent security, and AI agent audit.

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

## Principles

- Vendor neutral
- Pluggable
- Independent observation
- Verifiable by default
- Evidence over self-report

## Current Status

Proovex is being productized from capabilities incubated and validated in grado-companion-kit.

The current implementation remains in grado-companion-kit. This repository is the official product home and future standalone repository boundary, not a second implementation source. The capabilities above describe the product direction, not a claim that the standalone runtime has shipped.

Code extraction requires a separate extraction decision and Work Item. No runtime code is copied or maintained here in parallel.

“Open” describes the intended integration surface. No open-source license has been granted for this repository; the licensing strategy remains undecided.

This English README is the canonical product definition; the Simplified Chinese README is its localization, not a separate product definition.

## Vision

Read the [Vision](./VISION.md) for the long-term direction, independence principles, and product boundaries. This document is currently in English.

## Roadmap

Read the [Roadmap](./ROADMAP.md) for the intended product stages and what remains outside the core runtime. This document is currently in English. No release dates are committed.
