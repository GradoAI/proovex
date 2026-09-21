#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.env.DEVFLOW_ROOT ?? path.resolve(import.meta.dirname, "../.."));
const DIR = path.join(ROOT, ".grado", "devflow");
const STAGE_FILE = path.join(DIR, "stage.yaml");
const STATE_FILE = path.resolve(process.env.DEVFLOW_STATE_FILE ?? path.join(DIR, "state.json"));
const VALIDATION_STATES = new Set(["UNPROVEN", "SATISFIED"]);
const WORK_STATES = new Set(["READY", "CLAIMED", "VALIDATED", "COMPLETE"]);

type ProofState = "UNPROVEN" | "SATISFIED";
type WorkState = "READY" | "CLAIMED" | "VALIDATED" | "COMPLETE";
type ClaimStatus = "IN_PROGRESS" | "COMPLETE" | "FAILED";
type ReviewStatus = "NOT_DUE" | "DUE" | "BLOCKING" | "UNKNOWN";
type ReviewDecision = "CONTINUE" | "CORRECTION_REQUIRED" | "TOP_LEVEL_DECISION_REQUIRED";
type ArchitectureChange = "CREATE" | "EXTEND" | "NONE";

interface ProofSpec { id: string; name: string; required_validation: string; }
interface WorkCluster { id: string; required_work_packages: string[]; }
interface StageSpec {
  schema_version: number;
  design_baseline: string;
  stage: { id: string; name: string; status: string };
  proof_obligations: ProofSpec[];
  exit_gate: { requires_all_proof_obligations: boolean };
  review_policy: {
    triggers: string[];
    engine_status: "IMPLEMENTED" | "NOT_IMPLEMENTED";
    status_when_engine_absent: "UNKNOWN" | "NOT_DUE";
    key_proof_obligations: string[];
    max_review_gap: number;
    work_clusters: WorkCluster[];
  };
}
interface ArchitectureFit { change: ArchitectureChange; proposed_top_level_abstraction?: string; }
interface TaskContract { id: string; work_package_id: string; executor_neutral: boolean; architecture_fit?: ArchitectureFit; }
interface WorkPackage { id: string; proof_id: string; task_contract_id: string; title: string; state: WorkState; }
interface ReconciliationResult {
  result_id: string;
  task_contract_id: string;
  work_package_id: string;
  claim_status: ClaimStatus;
  validation_applied: boolean;
  proof_id?: string;
  evidence_refs?: string[];
  accepted_artifact_ref?: string;
}
interface ReviewCheckpoint {
  checkpoint_id: string;
  packet_id: string;
  decision: ReviewDecision;
  reviewed_reasons: string[];
  bound_last_result_id: string | null;
  stage_id: string;
}
interface ReviewState {
  status: ReviewStatus;
  reasons: string[];
  completed_since_last_review: number;
  facts: { last_result_id: string | null; last_review_checkpoint: string | null };
  checkpoints?: ReviewCheckpoint[];
  last_decision?: ReviewDecision | null;
}
interface DurableState {
  schema_version: number;
  stage_id: string;
  proof_obligations: Record<string, ProofState>;
  task_contracts: Record<string, TaskContract>;
  work_packages: Record<string, WorkPackage>;
  results: ReconciliationResult[];
  review: ReviewState;
}
interface ValidationFact { type: string; proof_id?: string; passed?: boolean; evidence_refs?: string[]; accepted_artifact_ref?: string; }
interface ResultEnvelope {
  schema_version: number;
  result_id: string;
  task_contract_id?: string;
  work_package_id: string;
  claim: { status: ClaimStatus };
  validation_facts?: ValidationFact[];
  architecture_fit?: ArchitectureFit;
}
interface ReviewRecordInput { packet_id: string; decision: ReviewDecision; }

function fail(message: string): void { console.error(`devflow: ${message}`); process.exitCode = 1; }
function readJson<T>(file: string): T { return JSON.parse(fs.readFileSync(file, "utf8")) as T; }
function writeJson(file: string, value: DurableState): void { fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); }
function hashId(prefix: string, value: unknown): string {
  return `${prefix}:${createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16)}`;
}
function normalizeState(state: DurableState): void {
  state.review.checkpoints ??= [];
  if (state.review.last_decision === undefined) state.review.last_decision = null;
}
function load(): { stage: StageSpec; state: DurableState } {
  const stage = readJson<StageSpec>(STAGE_FILE);
  const state = readJson<DurableState>(STATE_FILE);
  normalizeState(state);
  validateStage(stage);
  validateState(stage, state);
  return { stage, state };
}
function validateStage(s: StageSpec): void {
  const expected = ["PVX-S1-P1", "PVX-S1-P2", "PVX-S1-P3", "PVX-S1-P4", "PVX-S1-P5"];
  if (s.schema_version !== 1 || s.stage?.id !== "PVX-STAGE-1" || !Array.isArray(s.proof_obligations) || s.proof_obligations.length !== 5) throw new Error("invalid StageSpec");
  if (s.proof_obligations.some((p, i) => p.id !== expected[i]) || !s.exit_gate?.requires_all_proof_obligations) throw new Error("invalid StageSpec proof obligations");
  if (!s.review_policy || s.review_policy.engine_status !== "IMPLEMENTED" || !Number.isInteger(s.review_policy.max_review_gap) || s.review_policy.max_review_gap < 1) throw new Error("invalid StageSpec review policy");
}
function validateState(stage: StageSpec, state: DurableState): void {
  if (state.schema_version !== 1 || state.stage_id !== stage.stage.id || !state.proof_obligations || !state.work_packages || !state.task_contracts || !state.review) throw new Error("invalid durable state");
  for (const p of stage.proof_obligations) if (!VALIDATION_STATES.has(state.proof_obligations[p.id] ?? "")) throw new Error(`invalid proof state: ${p.id}`);
  if (!["NOT_DUE", "DUE", "BLOCKING", "UNKNOWN"].includes(state.review.status)) throw new Error("invalid review state");
  if (!Array.isArray(state.review.checkpoints)) throw new Error("invalid review checkpoints");
  for (const [id, wp] of Object.entries(state.work_packages)) {
    if (wp.id !== id || !WORK_STATES.has(wp.state) || !stage.proof_obligations.some((p) => p.id === wp.proof_id) || !state.task_contracts[wp.task_contract_id]?.executor_neutral) throw new Error(`invalid WorkPackage: ${id}`);
  }
}
function proofProjection(stage: StageSpec, state: DurableState): Array<ProofSpec & { state: ProofState }> {
  return stage.proof_obligations.map((p) => ({ ...p, state: state.proof_obligations[p.id] ?? "UNPROVEN" }));
}
function latestCheckpoint(state: DurableState): ReviewCheckpoint | null {
  const checkpoints = state.review.checkpoints ?? [];
  return checkpoints.length > 0 ? checkpoints[checkpoints.length - 1] ?? null : null;
}
function alignmentReviewPacket(stage: StageSpec, state: DurableState): Record<string, unknown> {
  if (!["DUE", "BLOCKING"].includes(state.review.status)) throw new Error("alignment review is not due");
  const proofs = proofProjection(stage, state);
  const triggerReasons = [...state.review.reasons].sort();
  const topLevelSignals = triggerReasons.filter((reason) => reason.startsWith("NEW_TOP_LEVEL_ABSTRACTION_PROPOSED:"));
  const packetSeed = {
    stage_id: stage.stage.id,
    design_baseline: stage.design_baseline,
    review_status: state.review.status,
    trigger_reasons: triggerReasons,
    last_result_id: state.review.facts.last_result_id,
    completed_since_last_review: state.review.completed_since_last_review,
  };
  return {
    packet_type: "ALIGNMENT_REVIEW_PACKET",
    packet_id: hashId("alignment-review", packetSeed),
    stage_id: stage.stage.id,
    design_baseline: stage.design_baseline,
    review_status: state.review.status,
    trigger_reasons: triggerReasons,
    original_intent: { stage_id: stage.stage.id, stage_name: stage.stage.name, design_baseline: stage.design_baseline },
    actual_progress: {
      satisfied_proofs: proofs.filter((p) => p.state === "SATISFIED").map((p) => p.id),
      total_proofs: proofs.length,
      work_packages: Object.values(state.work_packages).map((wp) => ({ id: wp.id, state: wp.state, proof_id: wp.proof_id })),
      completed_since_last_review: state.review.completed_since_last_review,
      last_result_id: state.review.facts.last_result_id,
    },
    proof_obligations: proofs,
    top_level_delta: topLevelSignals.length > 0 ? topLevelSignals : "NONE",
    reality_findings: { result_count: state.results.length, last_result_id: state.review.facts.last_result_id },
    fragmentation_signals: topLevelSignals.length > 0 ? topLevelSignals : [],
    recommendation: state.review.status === "BLOCKING" ? "TOP_LEVEL_DECISION_REQUIRED" : "CONTINUE",
  };
}
function acceptedArtifactBindings(stage: StageSpec, state: DurableState): Array<{ proof_id: string; work_package_id: string; accepted_artifact_ref: string; evidence_refs: string[]; result_id: string }> {
  return stage.proof_obligations.map((proof) => {
    const wp = Object.values(state.work_packages).find((candidate) => candidate.proof_id === proof.id);
    if (!wp) throw new Error(`missing WorkPackage for proof: ${proof.id}`);
    const result = [...state.results].reverse().find((candidate) => candidate.work_package_id === wp.id && candidate.validation_applied && candidate.proof_id === proof.id && candidate.accepted_artifact_ref);
    if (!result?.accepted_artifact_ref || !result.evidence_refs?.includes(result.accepted_artifact_ref)) throw new Error(`missing accepted artifact binding for proof: ${proof.id}`);
    return { proof_id: proof.id, work_package_id: wp.id, accepted_artifact_ref: result.accepted_artifact_ref, evidence_refs: result.evidence_refs, result_id: result.result_id };
  });
}
function stageGateReadiness(stage: StageSpec, state: DurableState): { ready: boolean; reason: string; checkpoint: ReviewCheckpoint | null } {
  if (!stage.proof_obligations.every((p) => state.proof_obligations[p.id] === "SATISFIED")) return { ready: false, reason: "proof obligations incomplete", checkpoint: latestCheckpoint(state) };
  const checkpoint = latestCheckpoint(state);
  if (!checkpoint || checkpoint.decision !== "CONTINUE" || !checkpoint.reviewed_reasons.includes("MANDATORY_PRE_EXIT")) return { ready: false, reason: "accepted mandatory pre-exit review checkpoint required", checkpoint };
  if (checkpoint.bound_last_result_id !== state.review.facts.last_result_id) return { ready: false, reason: "new result exists after pre-exit review checkpoint", checkpoint };
  if (state.review.status !== "NOT_DUE") return { ready: false, reason: `review status is ${state.review.status}`, checkpoint };
  try { acceptedArtifactBindings(stage, state); } catch (error) { return { ready: false, reason: error instanceof Error ? error.message : String(error), checkpoint }; }
  return { ready: true, reason: "READY_FOR_HUMAN_STAGE_GATE", checkpoint };
}
function projection(stage: StageSpec, state: DurableState): Record<string, unknown> {
  const proofs = proofProjection(stage, state);
  const exit = proofs.every((p) => p.state === "SATISFIED");
  const current = proofs.find((p) => p.state !== "SATISFIED");
  const checkpoint = latestCheckpoint(state);
  const gate = stageGateReadiness(stage, state);
  let action: string;
  if (state.review.status === "DUE") action = "ALIGNMENT_REVIEW";
  else if (state.review.status === "BLOCKING" && checkpoint?.decision === "CORRECTION_REQUIRED") action = "CORRECTION_REQUIRED";
  else if (state.review.status === "BLOCKING") action = "TOP_LEVEL_DECISION";
  else if (gate.ready) action = "STAGE_GATE";
  else if (exit) action = "ALIGNMENT_REVIEW";
  else action = `WORK_ON_${current?.id ?? "UNKNOWN"}`;
  let packet: Record<string, unknown> | null = null;
  if (["DUE", "BLOCKING"].includes(state.review.status)) packet = alignmentReviewPacket(stage, state);
  return {
    design_baseline: stage.design_baseline,
    active_stage: stage.stage,
    stage_status: stage.stage.status,
    proof_obligations: proofs,
    current_proof_target: current?.id ?? null,
    review_status: state.review.status,
    review_reasons: state.review.reasons,
    review_facts: {
      ...state.review.facts,
      last_review_decision: state.review.last_decision ?? null,
      last_review_checkpoint: checkpoint,
    },
    current_alignment_review_packet: packet,
    work_completed_since_last_review: state.review.completed_since_last_review,
    exit_gate: { complete: exit, required_proof_obligations: proofs.map((p) => p.id) },
    stage_gate: { ready: gate.ready, reason: gate.reason },
    next_eligible_action: action,
  };
}
function reviewTriggerEngine(stage: StageSpec, state: DurableState, previousProof: ProofState, wp: WorkPackage, input: ResultEnvelope, validated: boolean): void {
  const reasons = new Set(state.review.reasons);
  if (validated && previousProof === "UNPROVEN" && state.proof_obligations[wp.proof_id] === "SATISFIED" && stage.review_policy.key_proof_obligations.includes(wp.proof_id)) reasons.add(`KEY_PROOF_OBLIGATION_SATISFIED:${wp.proof_id}`);
  for (const cluster of stage.review_policy.work_clusters) if (cluster.required_work_packages.every((id) => ["VALIDATED", "COMPLETE"].includes(state.work_packages[id]?.state ?? ""))) reasons.add(`WORK_CLUSTER_COMPLETE:${cluster.id}`);
  const fit = input.architecture_fit ?? state.task_contracts[wp.task_contract_id]?.architecture_fit;
  if (fit?.change === "CREATE" && fit.proposed_top_level_abstraction) reasons.add(`NEW_TOP_LEVEL_ABSTRACTION_PROPOSED:${fit.proposed_top_level_abstraction}`);
  if (state.review.completed_since_last_review >= stage.review_policy.max_review_gap) reasons.add("MAX_REVIEW_GAP");
  if (stage.proof_obligations.every((p) => state.proof_obligations[p.id] === "SATISFIED")) reasons.add("MANDATORY_PRE_EXIT");
  const blocking = [...reasons].some((reason) => reason.startsWith("NEW_TOP_LEVEL_ABSTRACTION_PROPOSED:"));
  if (state.review.status === "UNKNOWN") state.review.status = "NOT_DUE";
  if (blocking) state.review.status = "BLOCKING";
  else if (state.review.status === "NOT_DUE" && reasons.size > 0) state.review.status = "DUE";
  state.review.reasons = [...reasons];
}
function reconcile(input: ResultEnvelope): Record<string, unknown> {
  const { stage, state } = load();
  if (!input || input.schema_version !== 1 || !input.result_id || !input.work_package_id || !input.claim) throw new Error("invalid ResultEnvelope");
  const existing = state.results.find((r) => r.result_id === input.result_id);
  if (existing) return projection(stage, state);
  const wp = state.work_packages[input.work_package_id];
  if (!wp) throw new Error(`unknown WorkPackage: ${input.work_package_id}`);
  if (input.task_contract_id && input.task_contract_id !== wp.task_contract_id) throw new Error("TaskContract does not match WorkPackage");
  if (!["IN_PROGRESS", "COMPLETE", "FAILED"].includes(input.claim.status)) throw new Error("invalid executor claim status");
  if (wp.state === "COMPLETE" || wp.state === "VALIDATED") throw new Error(`invalid state transition from ${wp.state}`);
  const previousProof = state.proof_obligations[wp.proof_id] ?? "UNPROVEN";
  wp.state = input.claim.status === "FAILED" ? "READY" : "CLAIMED";
  for (const fact of input.validation_facts ?? []) {
    if (fact.type === "proof-validation" && fact.passed === true && fact.accepted_artifact_ref && !(fact.evidence_refs ?? []).includes(fact.accepted_artifact_ref)) throw new Error("proof-validation artifact binding mismatch");
  }
  const validation = (input.validation_facts ?? []).find((f) => f.type === "proof-validation" && f.proof_id === wp.proof_id && f.passed === true && (f.evidence_refs?.length ?? 0) > 0 && typeof f.accepted_artifact_ref === "string" && f.accepted_artifact_ref.length > 0 && f.evidence_refs?.includes(f.accepted_artifact_ref));
  const validated = Boolean(validation);
  if (validated) {
    wp.state = "VALIDATED";
    state.proof_obligations[wp.proof_id] = "SATISFIED";
    state.review.completed_since_last_review += 1;
  }
  state.results.push({
    result_id: input.result_id,
    task_contract_id: wp.task_contract_id,
    work_package_id: wp.id,
    claim_status: input.claim.status,
    validation_applied: validated,
    ...(validation?.proof_id ? { proof_id: validation.proof_id } : {}),
    ...(validation?.evidence_refs ? { evidence_refs: validation.evidence_refs } : {}),
    ...(validation?.accepted_artifact_ref ? { accepted_artifact_ref: validation.accepted_artifact_ref } : {}),
  });
  state.review.facts.last_result_id = input.result_id;
  reviewTriggerEngine(stage, state, previousProof, wp, input, validated);
  writeJson(STATE_FILE, state);
  return projection(stage, state);
}
function recordReview(input: ReviewRecordInput): Record<string, unknown> {
  const { stage, state } = load();
  if (!input?.packet_id || !["CONTINUE", "CORRECTION_REQUIRED", "TOP_LEVEL_DECISION_REQUIRED"].includes(input.decision)) throw new Error("invalid review decision");
  const prior = (state.review.checkpoints ?? []).find((checkpoint) => checkpoint.packet_id === input.packet_id);
  if (prior) {
    if (prior.decision !== input.decision) throw new Error("review packet already recorded with a different decision");
    return projection(stage, state);
  }
  const packet = alignmentReviewPacket(stage, state);
  if (packet.packet_id !== input.packet_id) throw new Error("stale or mismatched alignment review packet");
  const checkpoint: ReviewCheckpoint = {
    checkpoint_id: hashId("review-checkpoint", { packet_id: input.packet_id, decision: input.decision }),
    packet_id: input.packet_id,
    decision: input.decision,
    reviewed_reasons: [...state.review.reasons],
    bound_last_result_id: state.review.facts.last_result_id,
    stage_id: stage.stage.id,
  };
  state.review.checkpoints ??= [];
  state.review.checkpoints.push(checkpoint);
  state.review.facts.last_review_checkpoint = checkpoint.checkpoint_id;
  state.review.last_decision = input.decision;
  if (input.decision === "CONTINUE") {
    state.review.status = "NOT_DUE";
    state.review.reasons = [];
    state.review.completed_since_last_review = 0;
  } else {
    state.review.status = "BLOCKING";
  }
  writeJson(STATE_FILE, state);
  return projection(stage, state);
}
function stageGatePacket(): Record<string, unknown> {
  const { stage, state } = load();
  const readiness = stageGateReadiness(stage, state);
  if (!readiness.ready || !readiness.checkpoint) throw new Error(`stage gate not ready: ${readiness.reason}`);
  const proofs = proofProjection(stage, state);
  const bindings = acceptedArtifactBindings(stage, state);
  const seed = { stage_id: stage.stage.id, design_baseline: stage.design_baseline, checkpoint_id: readiness.checkpoint.checkpoint_id, bindings };
  return {
    packet_type: "STAGE_GATE_PACKET",
    packet_id: hashId("stage-gate", seed),
    stage_id: stage.stage.id,
    stage_name: stage.stage.name,
    design_baseline: stage.design_baseline,
    proof_obligations: proofs,
    accepted_artifact_bindings: bindings,
    pre_exit_review_checkpoint: readiness.checkpoint,
    gate_readiness: "READY_FOR_HUMAN_STAGE_GATE",
  };
}
function main(): void {
  try {
    const [command, flag] = process.argv.slice(2);
    if (command === "status" && flag === "--json") {
      const { stage, state } = load();
      console.log(JSON.stringify(projection(stage, state), null, 2));
      return;
    }
    if (command === "reconcile") {
      console.log(JSON.stringify(reconcile(JSON.parse(fs.readFileSync(0, "utf8")) as ResultEnvelope), null, 2));
      return;
    }
    if (command === "review-packet") {
      const { stage, state } = load();
      console.log(JSON.stringify(alignmentReviewPacket(stage, state), null, 2));
      return;
    }
    if (command === "review-record") {
      console.log(JSON.stringify(recordReview(JSON.parse(fs.readFileSync(0, "utf8")) as ReviewRecordInput), null, 2));
      return;
    }
    if (command === "stage-gate-packet") {
      console.log(JSON.stringify(stageGatePacket(), null, 2));
      return;
    }
    throw new Error("usage: devflow status --json | devflow reconcile | devflow review-packet | devflow review-record | devflow stage-gate-packet");
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
  }
}
main();
