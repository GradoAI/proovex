# Proovex Vision

AI agents increasingly act on real systems, but their outputs are still mostly claims. A completed message does not establish that a file changed, a browser action took effect, or a system reached the intended state.

Proovex makes agent actions independently observable, verifiable, and auditable. Its purpose is to connect what an agent attempted with what actually happened, while preserving the origin and limits of the Evidence.

## A standard evidence layer

The long-term vision is a standard evidence layer between systems that act and systems that evaluate those actions:

```text
Agents / RPA / CUA
        ↓
     Proovex
        ↓
Evaluation / Security / Governance / Audit
```

A Run should connect Actions, Observations, State Changes, Side Effects, and Artifacts to independent Verification. An agent's claim and an independently observed effect must remain distinguishable. Missing Evidence must remain unknown rather than becoming an implied success.

## Independence as a product property

Proovex aims to be agent-framework independent, model independent, and execution-environment independent. A Collector should integrate with the environment where actions occur; a Verifier should assess available Evidence against explicit criteria without relying on the agent's account alone.

Real-world Side Effects matter as much as model output. Evidence should preserve source attribution and enough context to explain what a Verification result establishes—and what it does not.

An open integration surface should let producers, Collectors, Verifiers, and downstream consumers evolve without requiring one agent framework or vendor. This is a design direction; public contracts and licensing still require explicit decisions.

## Non-goals

Proovex is not:

- An Agent framework
- A workflow builder
- A prompt platform
- An AI IDE
- A generic observability product

It supplies Evidence and Verification infrastructure for those systems rather than replacing their planning, execution, or product responsibilities.

## From incubation to a standalone product

Capabilities were incubated and validated in grado-companion-kit. Productization must identify which capabilities transfer, establish standalone contracts, and demonstrate independent use before claiming a standalone runtime is complete.

This repository establishes that product boundary. Extraction remains a separate decision and Work Item, with one implementation source throughout the transition.
