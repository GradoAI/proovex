import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "../..");
const cli = path.join(root, "tools/devflow/devflow.ts");
const stateFile = path.join(root, ".grado/devflow/state.json");
const stageFile = path.join(root, ".grado/devflow/stage.yaml");
const initialState = fs.readFileSync(stateFile, "utf8");
const initialStage = fs.readFileSync(stageFile, "utf8");

const run = (args: string[], input = "") => execFileSync(process.execPath, [cli, ...args], { cwd: root, input, encoding: "utf8" });
const runWithoutExecutors = (args: string[], input = "") => {
  const env = { ...process.env };
  delete env.RELAY_URL;
  delete env.ANTHROPIC_API_KEY;
  delete env.OPENAI_API_KEY;
  return execFileSync(process.execPath, [cli, ...args], { cwd: root, input, encoding: "utf8", env });
};
const reset = () => { fs.writeFileSync(stateFile, initialState); fs.writeFileSync(stageFile, initialStage); };
const result = (id: string, wp: string, proof: string, extra: Record<string, unknown> = {}) => JSON.stringify({
  schema_version: 1,
  result_id: id,
  work_package_id: wp,
  claim: { status: "COMPLETE" },
  validation_facts: [{
    type: "proof-validation",
    proof_id: proof,
    passed: true,
    evidence_refs: [`git:${id}`],
    accepted_artifact_ref: `git:${id}`,
  }],
  ...extra,
});
const status = () => JSON.parse(run(["status", "--json"]));
const reconcile = (body: string) => JSON.parse(run(["reconcile"], body));
const reviewPacket = () => JSON.parse(run(["review-packet"]));
const reviewRecord = (packetId: string, decision: string) => JSON.parse(run(["review-record"], JSON.stringify({ packet_id: packetId, decision })));
const stageGatePacket = () => JSON.parse(run(["stage-gate-packet"]));
const configureReview = (change: (stage: Record<string, unknown>) => void) => {
  const stage = JSON.parse(initialStage) as Record<string, unknown>;
  change(stage);
  fs.writeFileSync(stageFile, JSON.stringify(stage));
};
const satisfyAll = () => {
  configureReview((s) => {
    const p = s.review_policy as Record<string, unknown>;
    p.key_proof_obligations = [];
    p.max_review_gap = 99;
  });
  for (let i = 1; i <= 5; i += 1) reconcile(result(`exit-${i}`, `WP-PVX-S1-P${i}`, `PVX-S1-P${i}`));
};

test.after(reset);

test("initial state is NOT_DUE and engine is implemented", () => {
  reset();
  const out = status();
  assert.equal(out.review_status, "NOT_DUE");
  assert.equal(out.exit_gate.complete, false);
  assert.equal(out.review_facts.last_review_checkpoint, null);
});

test("key proof transition triggers DUE and deterministic review packet", () => {
  reset();
  const out = reconcile(result("key", "WP-PVX-S1-P1", "PVX-S1-P1"));
  assert.equal(out.review_status, "DUE");
  assert.ok(out.review_reasons.includes("KEY_PROOF_OBLIGATION_SATISFIED:PVX-S1-P1"));
  assert.equal(out.next_eligible_action, "ALIGNMENT_REVIEW");
  const packet = reviewPacket();
  assert.equal(packet.packet_type, "ALIGNMENT_REVIEW_PACKET");
  assert.equal(packet.packet_id, out.current_alignment_review_packet.packet_id);
  assert.equal(packet.recommendation, "CONTINUE");
});

test("non-key proof does not trigger key-proof rule", () => {
  reset();
  const out = reconcile(result("non-key", "WP-PVX-S1-P2", "PVX-S1-P2"));
  assert.equal(out.review_status, "NOT_DUE");
  assert.equal(out.review_reasons.some((x: string) => x.startsWith("KEY_PROOF_OBLIGATION_SATISFIED")), false);
});

test("work cluster completion triggers DUE", () => {
  reset();
  configureReview((s) => {
    const p = s.review_policy as Record<string, unknown>;
    p.key_proof_obligations = [];
    p.max_review_gap = 99;
  });
  for (let i = 1; i <= 5; i += 1) reconcile(result(`cluster-${i}`, `WP-PVX-S1-P${i}`, `PVX-S1-P${i}`));
  const out = status();
  assert.equal(out.review_status, "DUE");
  assert.ok(out.review_reasons.includes("WORK_CLUSTER_COMPLETE:PVX-S1-CLUSTER"));
});

test("CREATE top-level abstraction is BLOCKING", () => {
  reset();
  const out = reconcile(result("create", "WP-PVX-S1-P1", "PVX-S1-P1", {
    architecture_fit: { change: "CREATE", proposed_top_level_abstraction: "NewBoundary" },
  }));
  assert.equal(out.review_status, "BLOCKING");
  assert.equal(out.next_eligible_action, "TOP_LEVEL_DECISION");
  assert.equal(reviewPacket().recommendation, "TOP_LEVEL_DECISION_REQUIRED");
});

test("max review gap triggers DUE", () => {
  reset();
  configureReview((s) => {
    const p = s.review_policy as Record<string, unknown>;
    p.key_proof_obligations = [];
    p.max_review_gap = 1;
  });
  const out = reconcile(result("gap", "WP-PVX-S1-P2", "PVX-S1-P2"));
  assert.equal(out.review_status, "DUE");
  assert.ok(out.review_reasons.includes("MAX_REVIEW_GAP"));
});

test("exit gate triggers mandatory pre-exit review", () => {
  reset();
  satisfyAll();
  const out = status();
  assert.equal(out.exit_gate.complete, true);
  assert.equal(out.review_status, "DUE");
  assert.ok(out.review_reasons.includes("MANDATORY_PRE_EXIT"));
  assert.equal(out.next_eligible_action, "ALIGNMENT_REVIEW");
  assert.equal(out.stage_gate.ready, false);
});

test("DUE and duplicate results remain durable and idempotent", () => {
  reset();
  const body = result("duplicate", "WP-PVX-S1-P1", "PVX-S1-P1");
  const first = reconcile(body);
  const second = reconcile(body);
  assert.equal(first.review_status, "DUE");
  assert.equal(second.next_eligible_action, "ALIGNMENT_REVIEW");
  const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  assert.equal(state.results.length, 1);
});

test("review trigger state survives restart", () => {
  reset();
  reconcile(result("restart", "WP-PVX-S1-P1", "PVX-S1-P1"));
  const reloaded = status();
  assert.equal(reloaded.review_status, "DUE");
  assert.equal(reloaded.work_completed_since_last_review, 1);
});

test("DUE remains blocked for ordinary work projection", () => {
  reset();
  reconcile(result("due-block", "WP-PVX-S1-P1", "PVX-S1-P1"));
  const out = reconcile(result("after-due", "WP-PVX-S1-P2", "PVX-S1-P2"));
  assert.equal(out.review_status, "DUE");
  assert.equal(out.next_eligible_action, "ALIGNMENT_REVIEW");
});

test("CONTINUE records durable checkpoint and resets review counters", () => {
  reset();
  reconcile(result("review", "WP-PVX-S1-P1", "PVX-S1-P1"));
  const packet = reviewPacket();
  const out = reviewRecord(packet.packet_id, "CONTINUE");
  assert.equal(out.review_status, "NOT_DUE");
  assert.equal(out.work_completed_since_last_review, 0);
  assert.equal(out.review_facts.last_review_decision, "CONTINUE");
  assert.ok(out.review_facts.last_review_checkpoint.checkpoint_id);
  const reloaded = status();
  assert.equal(reloaded.review_facts.last_review_checkpoint.checkpoint_id, out.review_facts.last_review_checkpoint.checkpoint_id);
});

test("duplicate identical review-record is idempotent", () => {
  reset();
  reconcile(result("review-idem", "WP-PVX-S1-P1", "PVX-S1-P1"));
  const packet = reviewPacket();
  const first = reviewRecord(packet.packet_id, "CONTINUE");
  const second = reviewRecord(packet.packet_id, "CONTINUE");
  assert.equal(second.review_facts.last_review_checkpoint.checkpoint_id, first.review_facts.last_review_checkpoint.checkpoint_id);
  const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  assert.equal(state.review.checkpoints.length, 1);
});

test("stale packet is rejected", () => {
  reset();
  reconcile(result("stale", "WP-PVX-S1-P1", "PVX-S1-P1"));
  const packet = reviewPacket();
  const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  state.review.reasons.push("MAX_REVIEW_GAP");
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  assert.throws(() => reviewRecord(packet.packet_id, "CONTINUE"), /stale or mismatched/);
});

test("CORRECTION_REQUIRED keeps ordinary continuation blocked", () => {
  reset();
  reconcile(result("correction", "WP-PVX-S1-P1", "PVX-S1-P1"));
  const packet = reviewPacket();
  const out = reviewRecord(packet.packet_id, "CORRECTION_REQUIRED");
  assert.equal(out.review_status, "BLOCKING");
  assert.equal(out.next_eligible_action, "CORRECTION_REQUIRED");
});

test("TOP_LEVEL_DECISION_REQUIRED retains blocking state", () => {
  reset();
  reconcile(result("top", "WP-PVX-S1-P1", "PVX-S1-P1", {
    architecture_fit: { change: "CREATE", proposed_top_level_abstraction: "EvidenceGraph" },
  }));
  const packet = reviewPacket();
  const out = reviewRecord(packet.packet_id, "TOP_LEVEL_DECISION_REQUIRED");
  assert.equal(out.review_status, "BLOCKING");
  assert.equal(out.next_eligible_action, "TOP_LEVEL_DECISION");
});

test("accepted mandatory pre-exit review produces StageGatePacket with artifact backlinks", () => {
  reset();
  satisfyAll();
  const packet = reviewPacket();
  const after = reviewRecord(packet.packet_id, "CONTINUE");
  assert.equal(after.next_eligible_action, "STAGE_GATE");
  assert.equal(after.stage_gate.ready, true);
  const gate = stageGatePacket();
  assert.equal(gate.packet_type, "STAGE_GATE_PACKET");
  assert.equal(gate.gate_readiness, "READY_FOR_HUMAN_STAGE_GATE");
  assert.equal(gate.accepted_artifact_bindings.length, 5);
  assert.equal(gate.pre_exit_review_checkpoint.decision, "CONTINUE");
});

test("all proofs satisfied without accepted pre-exit checkpoint has no StageGatePacket", () => {
  reset();
  satisfyAll();
  assert.throws(() => stageGatePacket(), /accepted mandatory pre-exit review checkpoint required/);
});

test("new result after pre-exit checkpoint invalidates prior gate readiness", () => {
  reset();
  satisfyAll();
  const packet = reviewPacket();
  reviewRecord(packet.packet_id, "CONTINUE");
  const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  state.review.facts.last_result_id = "later-result";
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  const out = status();
  assert.equal(out.stage_gate.ready, false);
  assert.match(out.stage_gate.reason, /new result exists/);
  assert.throws(() => stageGatePacket(), /new result exists/);
});

test("controller runs without Relay or provider credentials", () => {
  reset();
  const out = JSON.parse(runWithoutExecutors(["status", "--json"]));
  assert.equal(out.review_status, "NOT_DUE");
});

test("invalid StageSpec and unknown WorkPackage remain rejected", () => {
  reset();
  fs.writeFileSync(stageFile, JSON.stringify({ schema_version: 1, stage: { id: "BAD" }}));
  assert.throws(() => status());
  reset();
  assert.throws(() => reconcile(JSON.stringify({ schema_version: 1, result_id: "unknown", work_package_id: "WP-UNKNOWN", claim: { status: "COMPLETE" }})));
});

test("proof validation requires an accepted artifact and rejects mismatches", () => {
  reset();
  const missing = JSON.parse(result("missing-artifact", "WP-PVX-S1-P1", "PVX-S1-P1"));
  delete missing.validation_facts[0].accepted_artifact_ref;
  const missingOut = reconcile(JSON.stringify(missing));
  assert.equal(missingOut.exit_gate.complete, false);
  reset();
  const mismatch = JSON.parse(result("mismatch-artifact", "WP-PVX-S1-P1", "PVX-S1-P1"));
  mismatch.validation_facts[0].accepted_artifact_ref = "git:other";
  assert.throws(() => reconcile(JSON.stringify(mismatch)), /artifact binding mismatch/);
});
