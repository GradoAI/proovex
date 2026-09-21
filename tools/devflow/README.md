# Development Workflow Controller V1

`.grado/devflow/stage.yaml` is the repo-native StageSpec. It uses JSON syntax in a
`.yaml` file so the StageSpec can be read without a YAML dependency. `state.json`
is a durable, rebuildable projection input; it contains only controller facts.

`state.json` also carries the minimum TaskContract and WorkPackage records; these
are facts that can later be projected from Issues, PRs, and CI without changing
the controller contract.

`reconcile` accepts one ResultEnvelope on stdin. An executor `COMPLETE` claim only
moves a WorkPackage to `CLAIMED`; a proof needs an explicit passing
`proof-validation` fact with non-empty `evidence_refs`. The V2 trigger engine then
evaluates key proof transitions, the configured work cluster, proposed CREATE
abstractions, the max review gap, and the pre-exit gate. Once `DUE` or `BLOCKING`
is reached it remains durable until a later review-checkpoint implementation
provides an explicit reset.

The GitHub adapter (`github-event.ts`) accepts explicit PR body markers:

```text
DEVFLOW_WORK_PACKAGE: WP-PVX-S1-P1
DEVFLOW_TASK_CONTRACT: TC-PVX-S1-P1
DEVFLOW_PROOF: PVX-S1-P1
ARCHITECTURE_CHANGE: EXTEND | CREATE | NONE
PROPOSED_TOP_LEVEL_ABSTRACTION: <required for CREATE>
```

Merged PRs provide merge evidence only. A successful `workflow_run` can produce a
`proof-validation` fact only when its payload contains an explicit work package,
task contract, proof, and commit binding. GitHub Actions writes the resulting
projection to the repo-native `devflow/state` branch; the StageSpec remains on
`main` and the controller remains the only reconciliation authority.


## Governed review loop

The controller now closes the repo-native review/gate loop without adding another authority:

```text
ResultEnvelope
→ reconcile
→ review trigger
→ review-packet
→ Human decision
→ review-record
→ durable ReviewCheckpoint
→ status --json projection
→ stage-gate-packet
```

Commands:

```text
devflow status --json
devflow reconcile
devflow review-packet
devflow review-record
devflow stage-gate-packet
```

`review-record` accepts:

```json
{"packet_id":"alignment-review:...","decision":"CONTINUE"}
```

Allowed decisions:

- `CONTINUE`
- `CORRECTION_REQUIRED`
- `TOP_LEVEL_DECISION_REQUIRED`

A StageGatePacket is read-only and can be generated only after all proof obligations are satisfied, accepted-artifact backlinks are present, and the mandatory pre-exit review has a durable `CONTINUE` checkpoint bound to the latest result. The controller never advances the Stage automatically.

GitHub `workflow_dispatch` can record an explicit review decision. `devflow_test_only: true` routes only to the fixed `devflow/e2e-state` branch; canonical state remains fixed at `devflow/state`.


## Human decision transport from Web

A Human Review Decision can be persisted as a structured GitHub issue/PR comment and consumed by the same controller path:

```text
DEVFLOW_REVIEW_PACKET: alignment-review:...
DEVFLOW_REVIEW_DECISION: CONTINUE | CORRECTION_REQUIRED | TOP_LEVEL_DECISION_REQUIRED
DEVFLOW_TEST_ONLY: true | false
```

The GitHub adapter accepts only comments whose `author_association` is `OWNER`, `MEMBER`, or `COLLABORATOR`. The packet ID is still validated by `review-record` against the current deterministic AlignmentReviewPacket, so a stale comment cannot advance review state.

This is a transport adapter only:

```text
ChatGPT Web Human Decision
→ structured GitHub comment
→ GitHub adapter
→ existing review-record
→ project-owned durable ReviewCheckpoint
```

It does not create a second review engine or move governance authority into ChatGPT-doc.
