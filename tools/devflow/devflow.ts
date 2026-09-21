#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const DIR = path.join(ROOT, ".grado", "devflow");
const STAGE_FILE = path.join(DIR, "stage.yaml");
const STATE_FILE = path.join(DIR, "state.json");
const PROOF_STATES = new Set(["UNPROVEN", "SATISFIED"]);
const WORK_STATES = new Set(["READY", "CLAIMED", "VALIDATED", "COMPLETE"]);

type ProofState = "UNPROVEN" | "SATISFIED";
type WorkState = "READY" | "CLAIMED" | "VALIDATED" | "COMPLETE";
type ClaimStatus = "IN_PROGRESS" | "COMPLETE" | "FAILED";

interface ProofSpec { id: string; name: string; required_validation: string; }
interface StageSpec {
  schema_version: number;
  design_baseline: string;
  stage: { id: string; name: string; status: string };
  proof_obligations: ProofSpec[];
  exit_gate: { requires_all_proof_obligations: boolean };
  review_policy: { status_when_engine_absent: "UNKNOWN" | "NOT_DUE" };
}
interface TaskContract { id: string; work_package_id: string; executor_neutral: boolean; }
interface WorkPackage { id: string; proof_id: string; task_contract_id: string; title: string; state: WorkState; }
interface ReconciliationResult { result_id: string; task_contract_id: string; work_package_id: string; claim_status: ClaimStatus; validation_applied: boolean; }
interface DurableState {
  schema_version: number;
  stage_id: string;
  proof_obligations: Record<string, ProofState>;
  task_contracts: Record<string, TaskContract>;
  work_packages: Record<string, WorkPackage>;
  results: ReconciliationResult[];
}
interface ValidationFact { type: string; proof_id?: string; passed?: boolean; evidence_refs?: string[]; }
interface ResultEnvelope {
  schema_version: number;
  result_id: string;
  task_contract_id?: string;
  work_package_id: string;
  claim: { status: ClaimStatus };
  validation_facts?: ValidationFact[];
}

function fail(message: string): void { console.error(`devflow: ${message}`); process.exitCode = 1; }
function readJson<T>(file: string): T { return JSON.parse(fs.readFileSync(file, "utf8")) as T; }
function writeJson(file: string, value: DurableState): void { fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); }
function load(): { stage: StageSpec; state: DurableState } {
  const stage = readJson<StageSpec>(STAGE_FILE); const state = readJson<DurableState>(STATE_FILE); validateStage(stage); validateState(stage, state); return { stage, state };
}
function validateStage(s: StageSpec): void {
  if (!s || s.schema_version !== 1 || !s.stage?.id || s.stage.id !== "PVX-STAGE-1") throw new Error("invalid StageSpec");
  if (!Array.isArray(s.proof_obligations) || s.proof_obligations.length !== 5) throw new Error("invalid StageSpec proof obligations");
  const ids = s.proof_obligations.map((p: ProofSpec) => p.id); const expected = ["PVX-S1-P1", "PVX-S1-P2", "PVX-S1-P3", "PVX-S1-P4", "PVX-S1-P5"];
  if (ids.some((id, i) => id !== expected[i])) throw new Error("invalid StageSpec proof obligation IDs");
  if (!s.exit_gate?.requires_all_proof_obligations) throw new Error("invalid StageSpec exit gate");
}
function validateState(stage: StageSpec, state: DurableState): void {
  if (state.stage_id !== stage.stage.id || !state.proof_obligations || !state.work_packages || !state.task_contracts) throw new Error("invalid durable state");
  for (const p of stage.proof_obligations) if (!PROOF_STATES.has(state.proof_obligations[p.id] ?? "")) throw new Error(`invalid proof state: ${p.id}`);
  for (const [id, wp] of Object.entries(state.work_packages)) {
    if (wp.id !== id || !WORK_STATES.has(wp.state) || !stage.proof_obligations.some((p) => p.id === wp.proof_id) || !state.task_contracts[wp.task_contract_id]?.executor_neutral) throw new Error(`invalid WorkPackage: ${id}`);
  }
}
function projection(stage: StageSpec, state: DurableState): Record<string, unknown> {
  const proofs = stage.proof_obligations.map((p) => ({ ...p, state: state.proof_obligations[p.id] }));
  const current = proofs.find((p) => p.state !== "SATISFIED");
  const exit = proofs.every((p) => p.state === "SATISFIED");
  return { design_baseline: stage.design_baseline, active_stage: stage.stage, stage_status: stage.stage.status, proof_obligations: proofs,
    current_proof_target: current?.id ?? null, review_status: stage.review_policy.status_when_engine_absent,
    exit_gate: { complete: exit, required_proof_obligations: proofs.map((p) => p.id) },
    next_eligible_action: exit ? "MANDATORY_PRE_EXIT_REVIEW" : `WORK_ON_${current?.id ?? "UNKNOWN"}` };
}
function reconcile(input: ResultEnvelope): Record<string, unknown> {
  const { stage, state } = load();
  if (!input || input.schema_version !== 1 || !input.result_id || !input.work_package_id || !input.claim) throw new Error("invalid ResultEnvelope");
  const wp = state.work_packages[input.work_package_id]; if (!wp) throw new Error(`unknown WorkPackage: ${input.work_package_id}`);
  if (input.task_contract_id && input.task_contract_id !== wp.task_contract_id) throw new Error("TaskContract does not match WorkPackage");
  if (state.results.some((r) => r.result_id === input.result_id)) throw new Error(`duplicate ResultEnvelope: ${input.result_id}`);
  if (!["IN_PROGRESS", "COMPLETE", "FAILED"].includes(input.claim.status)) throw new Error("invalid executor claim status");
  const next = input.claim.status === "COMPLETE" ? "CLAIMED" : input.claim.status === "FAILED" ? "READY" : "CLAIMED";
  if (wp.state === "COMPLETE" || wp.state === "VALIDATED") throw new Error(`invalid state transition from ${wp.state}`);
  wp.state = next;
  const facts = Array.isArray(input.validation_facts) ? input.validation_facts : [];
  const valid = facts.some((f) => f.type === "proof-validation" && f.proof_id === wp.proof_id && f.passed === true && Array.isArray(f.evidence_refs) && f.evidence_refs.length > 0);
  if (valid) { wp.state = "VALIDATED"; state.proof_obligations[wp.proof_id] = "SATISFIED"; }
  state.results.push({ result_id: input.result_id, task_contract_id: wp.task_contract_id, work_package_id: wp.id, claim_status: input.claim.status, validation_applied: valid });
  writeJson(STATE_FILE, state); return projection(stage, state);
}
function main() {
  try { const [command, flag] = process.argv.slice(2); if (command === "status" && flag === "--json") { const { stage, state } = load(); console.log(JSON.stringify(projection(stage, state), null, 2)); return; }
    if (command === "reconcile") { const raw = fs.readFileSync(0, "utf8"); console.log(JSON.stringify(reconcile(JSON.parse(raw)), null, 2)); return; }
    throw new Error("usage: devflow status --json | devflow reconcile");
  } catch (e) { fail(e instanceof Error ? e.message : String(e)); }
}
main();
