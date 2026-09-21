import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { adaptGithubEvent } from './github-event.ts';

const body = `DEVFLOW_WORK_PACKAGE: WP-PVX-S1-P1\nDEVFLOW_TASK_CONTRACT: TC-PVX-S1-P1\nDEVFLOW_PROOF: PVX-S1-P1\nARCHITECTURE_CHANGE: EXTEND`;
const testBody = `${body}\nDEVFLOW_TEST_ONLY: true`;

test('merged PR metadata produces a ResultEnvelope without proof validation', () => {
  const out = adaptGithubEvent({ action: 'closed', pull_request: { number: 7, merged: true, base_ref: 'main', merge_commit_sha: 'abc123', body } });
  assert.equal(out.kind, 'RECONCILE');
  if (out.kind === 'RECONCILE') {
    assert.equal(out.envelope.work_package_id, 'WP-PVX-S1-P1');
    assert.equal(out.envelope.claim.status, 'COMPLETE');
    assert.equal(out.envelope.validation_facts?.[0]?.type, 'github-pr-merged');
  }
});

test('closed but unmerged PR is ignored', () => {
  const out = adaptGithubEvent({ action: 'closed', pull_request: { merged: false, body } });
  assert.equal(out.kind, 'NO_RECONCILIATION');
  if (out.kind === 'NO_RECONCILIATION') assert.equal(out.state_target, 'canonical');
});

test('missing or malformed PR metadata is rejected', () => {
  assert.equal(adaptGithubEvent({ action: 'closed', pull_request: { merged: true, number: 1, base_ref: 'main', merge_commit_sha: 'x', body: '' } }).kind, 'NO_RECONCILIATION');
  assert.equal(adaptGithubEvent({ action: 'closed', pull_request: { merged: true, number: 1, base_ref: 'main', merge_commit_sha: 'x', body: body.replace('EXTEND', 'BAD') } }).kind, 'NO_RECONCILIATION');
});

test('CREATE metadata reaches the existing blocking trigger', () => {
  const out = adaptGithubEvent({ action: 'closed', pull_request: { merged: true, number: 2, base_ref: 'main', merge_commit_sha: 'def456', body: `${body.replace('EXTEND', 'CREATE')}\nPROPOSED_TOP_LEVEL_ABSTRACTION: EvidenceGraph` } });
  assert.equal(out.kind, 'RECONCILE');
  if (out.kind === 'RECONCILE') assert.equal(out.envelope.architecture_fit?.change, 'CREATE');
});

test('successful workflow needs explicit binding and creates proof validation', () => {
  const out = adaptGithubEvent({ action: 'completed', workflow_run: { id: 9, conclusion: 'success', head_sha: 'fedcba', pull_requests: [{ number: 3 }] }, devflow_pr: { number: 3, body, merged: true, base_ref: 'main', merge_commit_sha: 'fedcba', head_sha: 'fedcba' } });
  assert.equal(out.kind, 'RECONCILE');
  if (out.kind === 'RECONCILE') {
    assert.equal(out.state_target, 'canonical');
    assert.equal(out.envelope.validation_facts?.[0]?.type, 'proof-validation');
    assert.equal(out.envelope.validation_facts?.[0]?.accepted_artifact_ref, 'git:fedcba');
  }
  assert.equal(adaptGithubEvent({ action: 'completed', workflow_run: { id: 10, conclusion: 'success', head_sha: 'x' }, devflow_pr: { number: 4, body, merged: false, base_ref: 'main', head_sha: 'x' } }).kind, 'NO_RECONCILIATION');
  assert.equal(adaptGithubEvent({ action: 'completed', workflow_run: { id: 11, conclusion: 'success', head_sha: 'x' } }).kind, 'NO_RECONCILIATION');
  const testOnly = adaptGithubEvent({ action: 'completed', workflow_run: { id: 12, conclusion: 'success', head_sha: 'testsha', pull_requests: [{ number: 5 }] }, devflow_pr: { number: 5, body: testBody, merged: false, base_ref: 'main', head_sha: 'testsha' } });
  assert.equal(testOnly.kind, 'RECONCILE');
  if (testOnly.kind === 'RECONCILE') assert.equal(testOnly.state_target, 'e2e');
});

test('workflow dispatch supports explicit recovery envelope', () => {
  const envelope = { schema_version: 1, result_id: 'manual-1', work_package_id: 'WP-PVX-S1-P1', claim: { status: 'COMPLETE' } };
  const out = adaptGithubEvent({ inputs: { result_envelope: JSON.stringify(envelope) } });
  assert.equal(out.kind, 'RECONCILE');
  assert.equal(adaptGithubEvent({ inputs: { result_envelope: '{bad' } }).kind, 'NO_RECONCILIATION');
});

test('GitHub event envelope reaches reconcile and survives a fresh process', () => {
  const root = path.resolve(import.meta.dirname, '../..');
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devflow-state-'));
  fs.mkdirSync(path.join(tempRoot, '.grado/devflow'), { recursive: true });
  fs.writeFileSync(path.join(tempRoot, '.grado/devflow/stage.yaml'), execFileSync('git', ['show', 'HEAD:.grado/devflow/stage.yaml'], { cwd: root, encoding: 'utf8' }));
  const stateFile = path.join(tempRoot, '.grado/devflow/state.json');
  fs.writeFileSync(stateFile, execFileSync('git', ['show', 'HEAD:.grado/devflow/state.json'], { cwd: root, encoding: 'utf8' }));
  const event = adaptGithubEvent({ action: 'completed', workflow_run: { id: 99, conclusion: 'success', head_sha: '012345', pull_requests: [{ number: 8 }] }, devflow_pr: { number: 8, body: testBody, merged: false, base_ref: 'main', head_sha: '012345' } });
  assert.equal(event.kind, 'RECONCILE');
  if (event.kind !== 'RECONCILE') return;
  const cli = path.join(root, 'tools/devflow/devflow.ts');
  const env = { ...process.env, DEVFLOW_ROOT: tempRoot, DEVFLOW_STATE_FILE: stateFile };
  execFileSync(process.execPath, [cli, 'reconcile'], { cwd: root, env, input: JSON.stringify(event.envelope), encoding: 'utf8' });
  const status = JSON.parse(execFileSync(process.execPath, [cli, 'status', '--json'], { cwd: root, env, encoding: 'utf8' })) as { exit_gate: { complete: boolean }; proof_obligations: Array<{ id: string; state: string }> };
  assert.equal(status.proof_obligations.find((proof) => proof.id === 'PVX-S1-P1')?.state, 'SATISFIED');
  assert.equal(status.exit_gate.complete, false);
});

test('sequential durable events load the prior projection before reconciling', () => {
  const root = path.resolve(import.meta.dirname, '../..');
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devflow-sequence-'));
  const tempRoot = path.join(stateDir, 'root');
  fs.mkdirSync(path.join(tempRoot, '.grado/devflow'), { recursive: true });
  fs.writeFileSync(path.join(tempRoot, '.grado/devflow/stage.yaml'), execFileSync('git', ['show', 'HEAD:.grado/devflow/stage.yaml'], { cwd: root, encoding: 'utf8' }));
  const stateFile = path.join(tempRoot, '.grado/devflow/state.json');
  fs.writeFileSync(stateFile, execFileSync('git', ['show', 'HEAD:.grado/devflow/state.json'], { cwd: root, encoding: 'utf8' }));
  const cli = path.join(root, 'tools/devflow/devflow.ts');
  const env = { ...process.env, DEVFLOW_ROOT: tempRoot, DEVFLOW_STATE_FILE: stateFile };
  const envelope = (id: string, wp: string, proof: string) => ({ schema_version: 1, result_id: id, work_package_id: wp, task_contract_id: `TC-${proof}`, claim: { status: 'COMPLETE' }, validation_facts: [{ type: 'proof-validation', proof_id: proof, passed: true, evidence_refs: [`git:${id}`], accepted_artifact_ref: `git:${id}` }] });
  execFileSync(process.execPath, [cli, 'reconcile'], { cwd: root, env, input: JSON.stringify(envelope('sequence-1', 'WP-PVX-S1-P2', 'PVX-S1-P2')), encoding: 'utf8' });
  execFileSync(process.execPath, [cli, 'reconcile'], { cwd: root, env, input: JSON.stringify(envelope('sequence-2', 'WP-PVX-S1-P3', 'PVX-S1-P3')), encoding: 'utf8' });
  const status = JSON.parse(execFileSync(process.execPath, [cli, 'status', '--json'], { cwd: root, env, encoding: 'utf8' })) as { proof_obligations: Array<{ id: string; state: string }> };
  assert.equal(status.proof_obligations.find((proof) => proof.id === 'PVX-S1-P2')?.state, 'SATISFIED');
  assert.equal(status.proof_obligations.find((proof) => proof.id === 'PVX-S1-P3')?.state, 'SATISFIED');
});


test('workflow dispatch supports explicit review decision with fixed state target', () => {
  const canonical = adaptGithubEvent({ inputs: { review_packet_id: 'alignment-review:abc', review_decision: 'CONTINUE' } });
  assert.equal(canonical.kind, 'REVIEW');
  if (canonical.kind === 'REVIEW') {
    assert.equal(canonical.state_target, 'canonical');
    assert.equal(canonical.review.decision, 'CONTINUE');
  }
  const e2e = adaptGithubEvent({ inputs: { review_packet_id: 'alignment-review:def', review_decision: 'CORRECTION_REQUIRED', devflow_test_only: true } });
  assert.equal(e2e.kind, 'REVIEW');
  if (e2e.kind === 'REVIEW') assert.equal(e2e.state_target, 'e2e');
  assert.equal(adaptGithubEvent({ inputs: { review_packet_id: 'x', review_decision: 'BAD' } }).kind, 'NO_RECONCILIATION');
});
