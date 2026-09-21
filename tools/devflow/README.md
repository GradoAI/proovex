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

Final sequential remote E2E marker.
