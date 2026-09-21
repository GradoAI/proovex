import fs from 'node:fs';

export interface ResultEnvelope {
  schema_version: 1;
  result_id: string;
  task_contract_id?: string;
  work_package_id: string;
  claim: { status: 'IN_PROGRESS' | 'COMPLETE' | 'FAILED' };
  validation_facts?: Array<{
    type: string;
    proof_id?: string;
    passed?: boolean;
    evidence_refs?: string[];
    accepted_artifact_ref?: string;
  }>;
  architecture_fit?: {
    change: 'CREATE' | 'EXTEND' | 'NONE';
    proposed_top_level_abstraction?: string;
  };
}

export type AdapterOutput =
  | { kind: 'RECONCILE'; state_target: 'canonical' | 'e2e'; envelope: ResultEnvelope }
  | { kind: 'NO_RECONCILIATION'; state_target: 'canonical' | 'e2e'; reason: string };

type JsonObject = Record<string, unknown>;

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;

function marker(body: string, name: string): string | undefined {
  const line = body.split(/\r?\n/).find((candidate) => candidate.trim().startsWith(`${name}:`));
  return line ? text(line.slice(name.length + 1)) : undefined;
}

function metadata(body: string): {
  workPackageId: string;
  taskContractId: string;
  proofId: string;
  testOnly: boolean;
  architectureFit: ResultEnvelope['architecture_fit'];
} | { error: string } {
  const workPackageId = marker(body, 'DEVFLOW_WORK_PACKAGE');
  const taskContractId = marker(body, 'DEVFLOW_TASK_CONTRACT');
  const proofId = marker(body, 'DEVFLOW_PROOF');
  const change = marker(body, 'ARCHITECTURE_CHANGE');
  const proposed = marker(body, 'PROPOSED_TOP_LEVEL_ABSTRACTION');
  const testOnlyMarker = marker(body, 'DEVFLOW_TEST_ONLY');
  if (!workPackageId || !/^WP-[A-Z0-9-]+$/.test(workPackageId)) return { error: 'missing or malformed DEVFLOW_WORK_PACKAGE' };
  if (!taskContractId || !/^TC-[A-Z0-9-]+$/.test(taskContractId)) return { error: 'missing or malformed DEVFLOW_TASK_CONTRACT' };
  if (!proofId || !/^PVX-S\d+-P\d+$/.test(proofId)) return { error: 'missing or malformed DEVFLOW_PROOF' };
  if (!change || !['CREATE', 'EXTEND', 'NONE'].includes(change)) return { error: 'missing or malformed ARCHITECTURE_CHANGE' };
  if (change === 'CREATE' && !proposed) return { error: 'CREATE requires PROPOSED_TOP_LEVEL_ABSTRACTION' };
  if (testOnlyMarker && testOnlyMarker !== 'true' && testOnlyMarker !== 'false') return { error: 'DEVFLOW_TEST_ONLY must be true or false' };
  return { workPackageId, taskContractId, proofId, testOnly: testOnlyMarker === 'true', architectureFit: { change: change as 'CREATE' | 'EXTEND' | 'NONE', ...(proposed ? { proposed_top_level_abstraction: proposed } : {}) } };
}

const noReconciliation = (reason: string, state_target: 'canonical' | 'e2e' = 'canonical'): AdapterOutput => ({ kind: 'NO_RECONCILIATION', state_target, reason });

function prEvent(event: JsonObject): AdapterOutput {
  const pr = event.pull_request as JsonObject | undefined;
  if (!pr || event.action !== 'closed') return noReconciliation('unsupported pull_request event');
  if (pr.merged !== true) return noReconciliation('pull request was not merged');
  const parsed = metadata(text(pr.body) ?? '');
  if ('error' in parsed) return noReconciliation(parsed.error);
  if (!text(pr.base_ref) || text(pr.base_ref) !== 'main') return noReconciliation('pull request target is not canonical main', parsed.testOnly ? 'e2e' : 'canonical');
  const number = pr.number ?? event.number;
  const mergeSha = text(pr.merge_commit_sha) ?? text((pr.head as JsonObject | undefined)?.sha);
  if (typeof number !== 'number' || !mergeSha) return noReconciliation('missing pull request identity', parsed.testOnly ? 'e2e' : 'canonical');
  return {
    kind: 'RECONCILE',
    state_target: parsed.testOnly ? 'e2e' : 'canonical',
    envelope: {
      schema_version: 1,
      result_id: `github-pr:${number}:merge:${mergeSha}`,
      task_contract_id: parsed.taskContractId,
      work_package_id: parsed.workPackageId,
      claim: { status: 'COMPLETE' },
      ...(parsed.architectureFit ? { architecture_fit: parsed.architectureFit } : {}),
      validation_facts: [{ type: 'github-pr-merged', proof_id: parsed.proofId, passed: true, evidence_refs: [`github-pr:${number}`, `git:${mergeSha}`] }],
    },
  };
}

function workflowRun(event: JsonObject): AdapterOutput {
  const run = event.workflow_run as JsonObject | undefined;
  if (!run || event.action !== 'completed') return noReconciliation('unsupported workflow_run event');
  if (run.conclusion !== 'success') return noReconciliation('workflow did not pass');
  const pr = event.devflow_pr as JsonObject | undefined;
  const parsed = metadata(text(pr?.body) ?? '');
  if ('error' in parsed) return noReconciliation(`associated PR: ${parsed.error}`);
  const wp = parsed.workPackageId;
  const tc = parsed.taskContractId;
  const proof = parsed.proofId;
  const sha = text(run.head_sha);
  const boundSha = text(pr?.head_sha) ?? text(pr?.merge_commit_sha);
  const id = run.id;
  if (!pr || !sha || !boundSha || sha !== boundSha || (typeof id !== 'number' && typeof id !== 'string')) return noReconciliation('workflow run lacks matching associated PR binding', parsed.testOnly ? 'e2e' : 'canonical');
  const testOnly = parsed.testOnly;
  if (!testOnly && (pr.merged !== true || text(pr.base_ref) !== 'main' || text(pr.merge_commit_sha) !== sha)) return noReconciliation('canonical proof requires merged PR accepted into main');
  return {
    kind: 'RECONCILE',
    state_target: testOnly ? 'e2e' : 'canonical',
    envelope: {
      schema_version: 1,
      result_id: `github-workflow-run:${id}`,
      task_contract_id: tc,
      work_package_id: wp,
      claim: { status: 'COMPLETE' },
      ...(parsed.architectureFit ? { architecture_fit: parsed.architectureFit } : {}),
      validation_facts: [{ type: 'proof-validation', proof_id: proof, passed: true, evidence_refs: [`github-workflow-run:${id}`, `github-pr:${pr.number ?? 'unknown'}`, `git:${sha}`], accepted_artifact_ref: `git:${sha}` }],
    },
  };
}

function dispatch(event: JsonObject): AdapterOutput {
  const inputs = (event.inputs ?? {}) as JsonObject;
  const raw = text(inputs.result_envelope) ?? text(event.result_envelope);
  if (raw) {
    try {
      const envelope = JSON.parse(raw) as ResultEnvelope;
      if (envelope.schema_version !== 1 || !envelope.result_id || !envelope.work_package_id || !envelope.claim) return noReconciliation('invalid explicit ResultEnvelope');
      return { kind: 'RECONCILE', state_target: 'canonical', envelope };
    } catch {
      return noReconciliation('invalid explicit ResultEnvelope JSON');
    }
  }
  return noReconciliation('workflow_dispatch requires result_envelope input');
}

export function adaptGithubEvent(event: unknown): AdapterOutput {
  if (!event || typeof event !== 'object') return noReconciliation('invalid event payload');
  const payload = event as JsonObject;
  if (payload.pull_request) return prEvent(payload);
  if (payload.workflow_run) return workflowRun(payload);
  if (payload.inputs || payload.result_envelope) return dispatch(payload);
  return noReconciliation('unsupported GitHub event');
}

if (process.argv[1] && process.argv[1].endsWith('github-event.ts')) {
  const input = fs.readFileSync(0, 'utf8');
  try {
    process.stdout.write(`${JSON.stringify(adaptGithubEvent(JSON.parse(input)))}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify(noReconciliation(error instanceof Error ? error.message : String(error)))}\n`);
    process.exitCode = 0;
  }
}
