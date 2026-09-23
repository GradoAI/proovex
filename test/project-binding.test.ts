import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const bindingPath = path.join(root, ".grado/project.yaml");
const stagePath = path.join(root, ".grado/devflow/stage.yaml");

interface ProjectBinding {
  schema_version: number;
  project_id: string;
  repository: string;
  normative_bindings: {
    workflow_contract: { repository: string; path: string; baseline: string };
    project_design: { repository: string; path: string; baseline: string };
  };
  engineering_authority: { canonical_branch: string };
  workflow_state_authority: {
    stage_spec_path: string;
    kind: string;
    branch: string;
    path: string;
  };
  planning_state_authority: {
    kind: string;
    branch: string;
    state_path: string;
    revisions_path: string;
    commit_point: string;
  };
  accepted_artifact_authority: {
    kind: string;
    canonical_branch: string;
    validation_workflow: string;
    reconciliation_adapter: string;
  };
  relay: { interface: string; binding_status: string };
}

const readJson = <T>(file: string): T => JSON.parse(fs.readFileSync(file, "utf8")) as T;

test("ProjectBinding matches the adopted PROJECT Bootstrap contract", () => {
  const binding = readJson<ProjectBinding>(bindingPath);
  const stage = readJson<{ design_baseline: string }>(stagePath);

  assert.equal(binding.schema_version, 1);
  assert.equal(binding.project_id, "proovex");
  assert.equal(binding.repository, "GradoAI/proovex");

  assert.deepEqual(binding.normative_bindings.workflow_contract, {
    repository: "GradoAI/ChatGPT-doc",
    path: "docs/project-bootstrap-contract.md",
    baseline: "GradoAI/ChatGPT-doc@99753a2c322287b5adc410adf6147612a098e55a",
  });

  assert.deepEqual(binding.normative_bindings.project_design, {
    repository: "GradoAI/ChatGPT-doc",
    path: "docs/proovex-top-level-design.md",
    baseline: "GradoAI/ChatGPT-doc@910e291fa0ac2a312629c2dd5f5dddfec2227950",
  });

  assert.notEqual(
    binding.normative_bindings.workflow_contract.baseline,
    binding.normative_bindings.project_design.baseline,
  );
  assert.equal(stage.design_baseline, binding.normative_bindings.project_design.baseline);

  assert.equal(binding.engineering_authority.canonical_branch, "main");
  assert.equal(binding.workflow_state_authority.stage_spec_path, ".grado/devflow/stage.yaml");
  assert.equal(binding.workflow_state_authority.kind, "git-branch-file");
  assert.equal(binding.workflow_state_authority.branch, "devflow/state");
  assert.equal(binding.workflow_state_authority.path, ".grado/devflow/state.json");
  assert.equal(fs.existsSync(path.join(root, binding.workflow_state_authority.stage_spec_path)), true);

  assert.deepEqual(binding.planning_state_authority, {
    kind: "git-branch-files",
    branch: "devflow/state",
    state_path: ".grado/planning/state.json",
    revisions_path: ".grado/planning/revisions",
    commit_point: "git-ref-compare-and-swap",
  });
  assert.equal(
    binding.planning_state_authority.branch,
    binding.workflow_state_authority.branch,
  );
  assert.notEqual(binding.planning_state_authority.state_path, binding.workflow_state_authority.path);
  assert.notEqual(binding.planning_state_authority.revisions_path, path.dirname(binding.workflow_state_authority.path));

  assert.equal(
    binding.accepted_artifact_authority.kind,
    "github-merged-pr-main-with-successful-validation",
  );
  assert.equal(binding.accepted_artifact_authority.canonical_branch, "main");
  assert.equal(binding.accepted_artifact_authority.validation_workflow, ".github/workflows/ci.yml");
  assert.equal(binding.accepted_artifact_authority.reconciliation_adapter, "tools/devflow/github-event.ts");
  assert.equal(fs.existsSync(path.join(root, binding.accepted_artifact_authority.validation_workflow)), true);
  assert.equal(fs.existsSync(path.join(root, binding.accepted_artifact_authority.reconciliation_adapter)), true);

  assert.deepEqual(binding.relay, {
    interface: "relay-project-contract-v1",
    binding_status: "UNBOUND",
  });
});
