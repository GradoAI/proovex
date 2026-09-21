import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { adaptGithubEvent } from './github-event.ts';

const body = `DEVFLOW_WORK_PACKAGE: WP-PVX-S1-P1\nDEVFLOW_TASK_CONTRACT: TC-PVX-S1-P1\nDEVFLOW_PROOF: PVX-S1-P1\nARCHITECTURE_CHANGE: EXTEND`;

test('merged PR metadata produces a ResultEnvelope without proof validation', () => {
  const out = adaptGithubEvent({ action: 'closed', pull_request: { number: 7, merged: true, merge_commit_sha: 'abc123', body } });
  assert.equal(out.kind, 'RECONCILE');
  if (out.kind === 'RECONCILE') {
    assert.equal(out.envelope.work_package_id, 'WP-PVX-S1-P1');
    assert.equal(out.envelope.claim.status, 'COMPLETE');
    assert.equal(out.envelope.validation_facts?.[0]?.type, 'github-pr-merged');
  }
});

test('closed but unmerged PR is ignored', () => {
  assert.deepEqual(adaptGithubEvent({ action: 'closed', pull_request: { merged: false, body } }), { kind: 'NO_RECONCILIATION', reason: 'pull request was not merged' });
});

test('missing or malformed PR metadata is rejected', () => {
  assert.equal(adaptGithubEvent({ action: 'closed', pull_request: { merged: true, number: 1, merge_commit_sha: 'x', body: '' } }).kind, 'NO_RECONCILIATION');
  assert.equal(adaptGithubEvent({ action: 'closed', pull_request: { merged: true, number: 1, merge_commit_sha: 'x', body: body.replace('EXTEND', 'BAD') } }).kind, 'NO_RECONCILIATION');
});

test('CREATE metadata reaches the existing blocking trigger', () => {
  const out = adaptGithubEvent({ action: 'closed', pull_request: { merged: true, number: 2, merge_commit_sha: 'def456', body: `${body.replace('EXTEND', 'CREATE')}\nPROPOSED_TOP_LEVEL_ABSTRACTION: EvidenceGraph` } });
  assert.equal(out.kind, 'RECONCILE');
  if (out.kind === 'RECONCILE') assert.equal(out.envelope.architecture_fit?.change, 'CREATE');
});

test('successful workflow needs explicit binding and creates proof validation', () => {
  const out = adaptGithubEvent({ action: 'completed', workflow_run: { id: 9, conclusion: 'success', head_sha: 'fedcba', devflow: { work_package_id: 'WP-PVX-S1-P1', task_contract_id: 'TC-PVX-S1-P1', proof_id: 'PVX-S1-P1' } } });
  assert.equal(out.kind, 'RECONCILE');
  if (out.kind === 'RECONCILE') assert.equal(out.envelope.validation_facts?.[0]?.type, 'proof-validation');
  assert.equal(adaptGithubEvent({ action: 'completed', workflow_run: { id: 10, conclusion: 'success', head_sha: 'x' } }).kind, 'NO_RECONCILIATION');
});

test('workflow dispatch supports explicit recovery envelope', () => {
  const envelope = { schema_version: 1, result_id: 'manual-1', work_package_id: 'WP-PVX-S1-P1', claim: { status: 'COMPLETE' } };
  const out = adaptGithubEvent({ inputs: { result_envelope: JSON.stringify(envelope) } });
  assert.equal(out.kind, 'RECONCILE');
  assert.equal(adaptGithubEvent({ inputs: { result_envelope: '{bad' } }).kind, 'NO_RECONCILIATION');
});

test('GitHub event envelope reaches reconcile and survives a fresh process', () => {
  const root = path.resolve(import.meta.dirname, '../..');
  const stateFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'devflow-state-')), 'state.json');
  fs.copyFileSync(path.join(root, '.grado/devflow/state.json'), stateFile);
  const event = adaptGithubEvent({ action: 'completed', workflow_run: { id: 99, conclusion: 'success', head_sha: '012345', devflow: { work_package_id: 'WP-PVX-S1-P1', task_contract_id: 'TC-PVX-S1-P1', proof_id: 'PVX-S1-P1' } } });
  assert.equal(event.kind, 'RECONCILE');
  if (event.kind !== 'RECONCILE') return;
  const cli = path.join(root, 'tools/devflow/devflow.ts');
  const env = { ...process.env, DEVFLOW_STATE_FILE: stateFile };
  execFileSync(process.execPath, [cli, 'reconcile'], { cwd: root, env, input: JSON.stringify(event.envelope), encoding: 'utf8' });
  const status = JSON.parse(execFileSync(process.execPath, [cli, 'status', '--json'], { cwd: root, env, encoding: 'utf8' })) as { exit_gate: { complete: boolean }; proof_obligations: Array<{ id: string; state: string }> };
  assert.equal(status.proof_obligations.find((proof) => proof.id === 'PVX-S1-P1')?.state, 'SATISFIED');
  assert.equal(status.exit_gate.complete, false);
});
