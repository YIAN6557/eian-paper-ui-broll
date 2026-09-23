import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  approveSkillJobPreview,
  createAndPrepareSkillJob,
  generateSkillJobPreview,
  invalidateSkillJobPreviewApproval,
  noteSkillJobFinalResolutionChange,
  readPersistedSkillJob,
  rejectSkillJobPreview,
} from '../../lib/skill-job-lifecycle.mjs';
import {resolveBackgroundState} from '../../lib/background-system.mjs';
import {chooseRepresentativeFrame} from '../../lib/preview-frame.mjs';
import {markPreviewReady, readState, writeState} from '../../lib/workflow-state.mjs';

const projectRoot = path.resolve('.');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eian-paper-ui-broll-skill-preview-'));
const jobsRoot = path.join(root, 'jobs');
const dialogue = 'User: Please preserve this exact dialogue.\nAI: This preview must represent the selected template and background.';
const longDialogue = fs.readFileSync(path.join(projectRoot, 'examples', 'inputs', 'dialogue.long.txt'), 'utf8');
const onePixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9JxE8AAAAASUVORK5CYII=', 'base64');

const idFactory = (...ids) => {
  let index = 0;
  return () => ids[index++] ?? `eian-preview-overflow-${index}`;
};
const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const passingDoctor = () => ({ok: true, summary: 'Environment ready.'});
const failingDoctor = () => ({ok: false, summary: 'FFmpeg is unavailable.'});
const fakePreviewRunner = ({workflowStatePath, outputPath}) => {
  fs.writeFileSync(outputPath, onePixelPng);
  let workflowState = readState(workflowStatePath);
  workflowState = resolveBackgroundState(workflowState);
  workflowState = markPreviewReady(workflowState, {path: outputPath});
  writeState(workflowStatePath, workflowState);
};
const createJob = ({jobId, templateId = 't01-reference-research-console', ratio = '9:16', resolution = '1080p', input = dialogue}) => (
  createAndPrepareSkillJob({
    input: {type: 'labelled-text', value: input},
    selection: {templateId, ratio, resolution},
    jobsRoot,
    projectRoot,
    idFactory: idFactory(jobId),
  })
);
const generateFakePreview = (statePath, extra = {}) => generateSkillJobPreview({
  statePath,
  projectRoot,
  doctorRunner: passingDoctor,
  previewRunner: fakePreviewRunner,
  ...extra,
});

try {
  const doctorFailureJob = createJob({jobId: 'eian-preview-doctor-failure'});
  const doctorFailure = generateSkillJobPreview({
    statePath: doctorFailureJob.persistence.statePath,
    projectRoot,
    doctorRunner: failingDoctor,
    previewRunner: fakePreviewRunner,
  });
  assert.equal(doctorFailure.jobId, doctorFailureJob.jobId, 'Doctor failure must preserve the job identity.');
  assert.equal(doctorFailure.status, 'readyForPreview');
  assert.equal(doctorFailure.preview.status, 'failed');
  assert.equal(doctorFailure.preview.approvalValid, false);
  assert.match(doctorFailure.preview.failureSummary, /FFmpeg is unavailable/);
  assert.equal(fs.existsSync(path.join(doctorFailure.persistence.jobDirectory, 'preview-r01.png')), false);
  const doctorFailureManifest = readJson(doctorFailure.persistence.manifestPath);
  assert.equal(doctorFailureManifest.jobId, doctorFailureJob.jobId);
  assert.equal(doctorFailureManifest.preview.status, 'failed');
  assert.equal(doctorFailureManifest.overallStatus, 'readyForPreview');

  const readyJob = createJob({jobId: 'eian-preview-approve'});
  const previewReady = generateFakePreview(readyJob.persistence.statePath);
  assert.equal(previewReady.status, 'previewReady');
  assert.equal(previewReady.preview.revision, 1);
  assert.equal(previewReady.preview.status, 'ready');
  assert.equal(previewReady.preview.approvalValid, false);
  assert.match(previewReady.preview.artifact, /preview-r01\.png$/);
  assert.equal(fs.existsSync(previewReady.preview.artifact), true);
  const expectedFrame = chooseRepresentativeFrame(readJson(readyJob.workflow.timelineReference));
  assert.equal(previewReady.preview.representativeFrame, expectedFrame);
  const workflowPreviewReady = readJson(readyJob.workflow.stateReference);
  assert.equal(workflowPreviewReady.preview.global.status, 'ready');
  const previewReadyManifest = readJson(readyJob.persistence.manifestPath);
  assert.equal(previewReadyManifest.preview.revision, 1);
  assert.equal(previewReadyManifest.preview.artifact, previewReady.preview.artifact);
  assert.equal(previewReadyManifest.overallStatus, 'previewReady');
  assert(!JSON.stringify(previewReadyManifest).includes('Please preserve this exact dialogue.'), 'Preview manifest updates must not duplicate full dialogue text.');

  const approved = approveSkillJobPreview({statePath: readyJob.persistence.statePath, projectRoot});
  assert.equal(approved.status, 'readyForRender');
  assert.equal(approved.preview.status, 'approved');
  assert.equal(approved.preview.approvalValid, true);
  assert.equal(approved.locks.contentLocked, true);
  assert.equal(approved.locks.backgroundLocked, true);
  const workflowApproved = readJson(readyJob.workflow.stateReference);
  assert.equal(workflowApproved.phase, 'approved');
  assert.equal(workflowApproved.preview.global.status, 'approved');
  assert.equal(workflowApproved.locks.contentLocked, true);
  assert.equal(workflowApproved.locks.backgroundLocked, true);
  const approvedManifest = readJson(readyJob.persistence.manifestPath);
  assert.equal(approvedManifest.preview.status, 'approved');
  assert.equal(approvedManifest.preview.approvalValid, true);
  assert.equal(approvedManifest.overallStatus, 'readyForRender');

  const rejectedJob = createJob({jobId: 'eian-preview-revision'});
  const rejectedReady = generateFakePreview(rejectedJob.persistence.statePath);
  const rejected = rejectSkillJobPreview({
    statePath: rejectedJob.persistence.statePath,
    projectRoot,
    reason: 'Increase the visible content density.',
  });
  assert.equal(rejected.status, 'readyForPreview');
  assert.equal(rejected.preview.revision, 1);
  assert.equal(rejected.preview.status, 'rejected');
  assert.equal(rejected.preview.approvalValid, false);
  assert.equal(rejected.preview.rejectionSummary, 'Increase the visible content density.');
  assert.equal(rejected.preview.history.length, 1);
  assert.equal(rejected.preview.history[0].artifact, rejectedReady.preview.artifact);
  assert.equal(rejected.preview.history[0].status, 'rejected');
  const rejectedManifest = readJson(rejectedJob.persistence.manifestPath);
  assert.equal(rejectedManifest.preview.status, 'rejected');
  assert.equal(rejectedManifest.preview.revision, 1);
  assert.equal(rejectedManifest.overallStatus, 'readyForPreview');
  assert.equal(readJson(rejectedJob.workflow.stateReference).preview.global.status, 'ready', 'Rejection must not fabricate existing workflow approval.');

  const revised = generateFakePreview(rejectedJob.persistence.statePath);
  assert.equal(revised.preview.revision, 2);
  assert.equal(revised.preview.status, 'ready');
  assert.match(revised.preview.artifact, /preview-r02\.png$/);
  assert.notEqual(revised.preview.artifact, rejectedReady.preview.artifact);
  assert.equal(fs.existsSync(rejectedReady.preview.artifact), true, 'Rejected Preview history must not be overwritten.');
  assert.equal(revised.preview.history.length, 2);
  const revisedManifest = readJson(rejectedJob.persistence.manifestPath);
  assert.equal(revisedManifest.preview.revision, 2);
  assert.equal(revisedManifest.preview.artifact, revised.preview.artifact);
  assert.equal(revisedManifest.overallStatus, 'previewReady');
  const revisedApproved = approveSkillJobPreview({statePath: rejectedJob.persistence.statePath, projectRoot});
  assert.equal(revisedApproved.status, 'readyForRender');
  assert.equal(revisedApproved.preview.approvalValid, true);

  const multipartJob = createJob({jobId: 'eian-preview-multipart', input: longDialogue.repeat(3)});
  assert.equal(multipartJob.durationPlan.outputMode, 'multipart');
  const previewCalls = [];
  const multipartPreview = generateFakePreview(multipartJob.persistence.statePath, {
    previewRunner: (options) => {
      previewCalls.push(options);
      fakePreviewRunner(options);
    },
  });
  assert.equal(previewCalls.length, 1, 'A multi-Part job must generate one global Preview.');
  assert.equal(previewCalls[0].part, null);
  assert.equal(multipartPreview.preview.representativeFrame, chooseRepresentativeFrame(readJson(multipartJob.workflow.timelineReference)));
  assert(multipartPreview.preview.representativeFrame >= multipartJob.durationPlan.userVisibleParts[0].timelineEnd, 'The global representative frame must be allowed to come after Part 1.');

  for (const changedField of ['template', 'ratio', 'background', 'input']) {
    const invalidationJob = createJob({jobId: `eian-preview-invalidate-${changedField}`});
    generateFakePreview(invalidationJob.persistence.statePath);
    approveSkillJobPreview({statePath: invalidationJob.persistence.statePath, projectRoot});
    const invalidated = invalidateSkillJobPreviewApproval({
      statePath: invalidationJob.persistence.statePath,
      projectRoot,
      changedFields: [changedField],
    });
    assert.equal(invalidated.status, 'readyForPreview', `${changedField} change must return the job to Preview.`);
    assert.equal(invalidated.preview.status, 'stale');
    assert.equal(invalidated.preview.approvalValid, false);
    assert.equal(invalidated.locks.contentLocked, false);
    assert.equal(invalidated.locks.backgroundLocked, false);
    assert.equal(readJson(invalidationJob.workflow.stateReference).preview.global.status, 'not_generated');
    assert.equal(readJson(invalidationJob.persistence.manifestPath).preview.status, 'stale');
  }

  const resolutionJob = createJob({jobId: 'eian-preview-resolution', resolution: '1080p'});
  generateFakePreview(resolutionJob.persistence.statePath);
  approveSkillJobPreview({statePath: resolutionJob.persistence.statePath, projectRoot});
  const resolutionChanged = noteSkillJobFinalResolutionChange({
    statePath: resolutionJob.persistence.statePath,
    projectRoot,
    resolution: '720p',
  });
  assert.equal(resolutionChanged.status, 'readyForRender');
  assert.equal(resolutionChanged.selection.resolution, '720p');
  assert.equal(resolutionChanged.preview.status, 'approved');
  assert.equal(resolutionChanged.preview.approvalValid, true);
  assert.equal(resolutionChanged.preview.finalParameterConfirmationPending, true);
  assert.equal(readJson(resolutionJob.persistence.manifestPath).preview.approvalValid, true);

  assert.throws(() => createJob({jobId: 'eian-preview-t03-square', templateId: 't03-keyflow', ratio: '1:1'}), /not enabled/);
  assert.equal(readPersistedSkillJob(readyJob.persistence.statePath).status, 'readyForRender');

  console.log('Skill Preview lifecycle tests: PASS');
} finally {
  fs.rmSync(root, {recursive: true, force: true});
}
