#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const DIR = path.join(ROOT, ".grado", "devflow");
const STAGE_FILE = path.join(DIR, "stage.yaml");
const STATE_FILE = path.join(DIR, "state.json");
const VALIDATION_STATES = new Set(["UNPROVEN", "SATISFIED"]);
const WORK_STATES = new Set(["READY", "CLAIMED", "VALIDATED", "COMPLETE"]);

type ProofState = "UNPROVEN" | "SATISFIED";
type WorkState = "READY" | "CLAIMED" | "VALIDATED" | "COMPLETE";
type ClaimStatus = "IN_PROGRESS" | "COMPLETE" | "FAILED";
type ReviewStatus = "NOT_DUE" | "DUE" | "BLOCKING" | "UNKNOWN";
type ArchitectureChange = "CREATE" | "EXTEND" | "NONE";
interface ProofSpec { id: string; name: string; required_validation: string; }
interface WorkCluster { id: string; required_work_packages: string[]; }
interface StageSpec {
  schema_version: number; design_baseline: string; stage: { id: string; name: string; status: string }; proof_obligations: ProofSpec[];
  exit_gate: { requires_all_proof_obligations: boolean }; review_policy: { triggers: string[]; engine_status: "IMPLEMENTED" | "NOT_IMPLEMENTED"; status_when_engine_absent: "UNKNOWN" | "NOT_DUE"; key_proof_obligations: string[]; max_review_gap: number; work_clusters: WorkCluster[] };
}
interface ArchitectureFit { change: ArchitectureChange; proposed_top_level_abstraction?: string; }
interface TaskContract { id: string; work_package_id: string; executor_neutral: boolean; architecture_fit?: ArchitectureFit; }
interface WorkPackage { id: string; proof_id: string; task_contract_id: string; title: string; state: WorkState; }
interface ReconciliationResult { result_id: string; task_contract_id: string; work_package_id: string; claim_status: ClaimStatus; validation_applied: boolean; }
interface ReviewState { status: ReviewStatus; reasons: string[]; completed_since_last_review: number; facts: { last_result_id: string | null; last_review_checkpoint: string | null }; }
interface DurableState { schema_version: number; stage_id: string; proof_obligations: Record<string, ProofState>; task_contracts: Record<string, TaskContract>; work_packages: Record<string, WorkPackage>; results: ReconciliationResult[]; review: ReviewState; }
interface ValidationFact { type: string; proof_id?: string; passed?: boolean; evidence_refs?: string[]; }
interface ResultEnvelope { schema_version: number; result_id: string; task_contract_id?: string; work_package_id: string; claim: { status: ClaimStatus }; validation_facts?: ValidationFact[]; architecture_fit?: ArchitectureFit; }

function fail(message: string): void { console.error(`devflow: ${message}`); process.exitCode = 1; }
function readJson<T>(file: string): T { return JSON.parse(fs.readFileSync(file, "utf8")) as T; }
function writeJson(file: string, value: DurableState): void { fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); }
function load(): { stage: StageSpec; state: DurableState } { const stage = readJson<StageSpec>(STAGE_FILE); const state = readJson<DurableState>(STATE_FILE); validateStage(stage); validateState(stage, state); return { stage, state }; }
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
  for (const [id, wp] of Object.entries(state.work_packages)) if (wp.id !== id || !WORK_STATES.has(wp.state) || !stage.proof_obligations.some((p) => p.id === wp.proof_id) || !state.task_contracts[wp.task_contract_id]?.executor_neutral) throw new Error(`invalid WorkPackage: ${id}`);
}
function projection(stage: StageSpec, state: DurableState): Record<string, unknown> {
  const proofs = stage.proof_obligations.map((p) => ({ ...p, state: state.proof_obligations[p.id] })); const exit = proofs.every((p) => p.state === "SATISFIED"); const current = proofs.find((p) => p.state !== "SATISFIED");
  const action = state.review.status === "DUE" ? "ALIGNMENT_REVIEW" : state.review.status === "BLOCKING" ? "TOP_LEVEL_DECISION" : exit ? "ALIGNMENT_REVIEW" : `WORK_ON_${current?.id ?? "UNKNOWN"}`;
  return { design_baseline: stage.design_baseline, active_stage: stage.stage, stage_status: stage.stage.status, proof_obligations: proofs, current_proof_target: current?.id ?? null, review_status: state.review.status, review_reasons: state.review.reasons, review_facts: state.review.facts, work_completed_since_last_review: state.review.completed_since_last_review, exit_gate: { complete: exit, required_proof_obligations: proofs.map((p) => p.id) }, next_eligible_action: action };
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
  const { stage, state } = load(); if (!input || input.schema_version !== 1 || !input.result_id || !input.work_package_id || !input.claim) throw new Error("invalid ResultEnvelope");
  const existing = state.results.find((r) => r.result_id === input.result_id); if (existing) return projection(stage, state);
  const wp = state.work_packages[input.work_package_id]; if (!wp) throw new Error(`unknown WorkPackage: ${input.work_package_id}`);
  if (input.task_contract_id && input.task_contract_id !== wp.task_contract_id) throw new Error("TaskContract does not match WorkPackage");
  if (!["IN_PROGRESS", "COMPLETE", "FAILED"].includes(input.claim.status)) throw new Error("invalid executor claim status");
  if (wp.state === "COMPLETE" || wp.state === "VALIDATED") throw new Error(`invalid state transition from ${wp.state}`);
  const previousProof = state.proof_obligations[wp.proof_id] ?? "UNPROVEN"; wp.state = input.claim.status === "FAILED" ? "READY" : "CLAIMED";
  const validated = (input.validation_facts ?? []).some((f) => f.type === "proof-validation" && f.proof_id === wp.proof_id && f.passed === true && (f.evidence_refs?.length ?? 0) > 0);
  if (validated) { wp.state = "VALIDATED"; state.proof_obligations[wp.proof_id] = "SATISFIED"; state.review.completed_since_last_review += 1; }
  state.results.push({ result_id: input.result_id, task_contract_id: wp.task_contract_id, work_package_id: wp.id, claim_status: input.claim.status, validation_applied: validated }); state.review.facts.last_result_id = input.result_id;
  reviewTriggerEngine(stage, state, previousProof, wp, input, validated); writeJson(STATE_FILE, state); return projection(stage, state);
}
function main(): void { try { const [command, flag] = process.argv.slice(2); if (command === "status" && flag === "--json") { const { stage, state } = load(); console.log(JSON.stringify(projection(stage, state), null, 2)); return; } if (command === "reconcile") { console.log(JSON.stringify(reconcile(JSON.parse(fs.readFileSync(0, "utf8")) as ResultEnvelope), null, 2)); return; } throw new Error("usage: devflow status --json | devflow reconcile"); } catch (e) { fail(e instanceof Error ? e.message : String(e)); } }
main();
