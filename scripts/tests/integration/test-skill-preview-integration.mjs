import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createAndPrepareSkillJob,
  generateSkillJobPreview,
  readPersistedSkillJob,
} from '../../lib/skill-job-lifecycle.mjs';
import {previewCanvasForRatio} from '../../lib/background-system.mjs';

const projectRoot = path.resolve('.');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eian-paper-ui-broll-skill-preview-integration-'));
const jobsRoot = path.join(root, 'jobs');
const inputPath = path.join(root, 'dialogue.txt');
const dialogue = 'User: Please preserve this exact message.\nAI: This representative Preview confirms the template, ratio, background, and current content density.';
fs.writeFileSync(inputPath, dialogue);

const idFactory = (...ids) => {
  let index = 0;
  return () => ids[index++] ?? `eian-preview-integration-${index}`;
};
const pngDimensions = (filePath) => {
  const bytes = fs.readFileSync(filePath);
  assert.equal(bytes.subarray(1, 4).toString('ascii'), 'PNG');
  assert.equal(bytes.subarray(12, 16).toString('ascii'), 'IHDR');
  return {width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20)};
};
const assertPreview = (skillJob, ratio) => {
  const stored = readPersistedSkillJob(skillJob.persistence.statePath);
  assert.equal(stored.status, 'previewReady');
  assert.equal(stored.doctor.status, 'passed');
  assert.equal(stored.preview.status, 'ready');
  assert.equal(stored.preview.revision, 1);
  assert.equal(stored.preview.approvalValid, false);
  assert.equal(fs.existsSync(stored.preview.artifact), true);
  assert.deepEqual(pngDimensions(stored.preview.artifact), previewCanvasForRatio(ratio));
  const manifest = JSON.parse(fs.readFileSync(stored.persistence.manifestPath, 'utf8'));
  assert.equal(manifest.preview.artifact, stored.preview.artifact);
  assert.equal(manifest.preview.revision, 1);
  assert.equal(manifest.overallStatus, 'previewReady');
  assert(!JSON.stringify(manifest).includes('Please preserve this exact message.'), 'Preview manifest must not contain full source dialogue.');
  return stored;
};
const collectMp4s = (directory) => {
  const found = [];
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...collectMp4s(target));
    if (entry.isFile() && entry.name.endsWith('.mp4')) found.push(target);
  }
  return found;
};

try {
  const cliCreated = JSON.parse(execFileSync(process.execPath, [
    'scripts/cli/skill-job.mjs', 'create', '--input', inputPath, '--input-type', 'labelled-text',
    '--template', 't01-reference-research-console', '--ratio', '9:16', '--resolution', '1080p', '--jobs-root', jobsRoot,
  ], {cwd: projectRoot, encoding: 'utf8'}));
  const cliPreview = JSON.parse(execFileSync(process.execPath, [
    'scripts/cli/skill-job.mjs', 'preview', '--job', cliCreated.jobId, '--jobs-root', jobsRoot,
  ], {cwd: projectRoot, encoding: 'utf8'}));
  assert.equal(cliPreview.status, 'previewReady');
  const t01 = assertPreview(readPersistedSkillJob(cliPreview.statePath), '9:16');

  const cliApproved = JSON.parse(execFileSync(process.execPath, [
    'scripts/cli/skill-job.mjs', 'approve-preview', '--job', cliCreated.jobId, '--jobs-root', jobsRoot,
  ], {cwd: projectRoot, encoding: 'utf8'}));
  assert.equal(cliApproved.status, 'readyForRender');
  const t01Approved = readPersistedSkillJob(cliApproved.statePath);
  assert.equal(t01Approved.preview.status, 'approved');
  assert.equal(t01Approved.preview.approvalValid, true);
  assert.equal(JSON.parse(fs.readFileSync(t01Approved.workflow.stateReference, 'utf8')).preview.global.status, 'approved');
  assert.equal(JSON.parse(execFileSync(process.execPath, [
    'scripts/cli/skill-job.mjs', 'show', '--job', cliCreated.jobId, '--jobs-root', jobsRoot,
  ], {cwd: projectRoot, encoding: 'utf8'})).status, 'readyForRender');

  const t02Job = createAndPrepareSkillJob({
    input: {type: 'labelled-text', value: dialogue},
    selection: {templateId: 't02-paper-dialogue', ratio: '1:1', resolution: '1080p'},
    jobsRoot,
    projectRoot,
    idFactory: idFactory('eian-preview-integration-t02'),
  });
  generateSkillJobPreview({statePath: t02Job.persistence.statePath, projectRoot});
  assertPreview(t02Job, '1:1');

  const t03Job = createAndPrepareSkillJob({
    input: {type: 'labelled-text', value: dialogue},
    selection: {templateId: 't03-keyflow', ratio: '16:9', resolution: '1080p'},
    jobsRoot,
    projectRoot,
    idFactory: idFactory('eian-preview-integration-t03'),
  });
  generateSkillJobPreview({statePath: t03Job.persistence.statePath, projectRoot});
  assertPreview(t03Job, '16:9');

  assert.throws(() => execFileSync(process.execPath, [
    'scripts/cli/skill-job.mjs', 'create', '--input', inputPath, '--input-type', 'labelled-text',
    '--template', 't03-keyflow', '--ratio', '1:1', '--jobs-root', jobsRoot,
  ], {cwd: projectRoot, encoding: 'utf8', stdio: 'pipe'}), /not enabled/);
  assert.deepEqual(collectMp4s(root), [], 'Task 08 Preview integration must not render MP4 output.');

  console.log('Skill Preview Remotion integration tests: PASS');
} finally {
  fs.rmSync(root, {recursive: true, force: true});
}
