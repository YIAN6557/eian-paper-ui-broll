import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  approveSkillJobPreview,
  approveSkillJobUserVisiblePartPreview,
  confirmSkillJobFinalParameters,
  createAndPrepareSkillJob,
  finalizeSkillJobFormalRender,
  generateSkillJobPreview,
  generateSkillJobUserVisiblePartPreview,
  noteSkillJobFinalResolutionChange,
  prepareSkillJobTwoPartTemplateException,
  readPersistedSkillJob,
  renderSkillJobFormal,
  repairSkillJobManifest,
  retrySkillJobFormalRender,
} from '../../lib/skill-job-lifecycle.mjs';
import {finalDimensionsFor} from '../../lib/skill-orchestration.mjs';
import {
  approvePreview,
  beginUserVisiblePartRender,
  completeUserVisiblePartRender,
  failUserVisiblePartRender,
  markPreviewReady,
  readState,
  writeState,
} from '../../lib/workflow-state.mjs';
import {resolveBackgroundState} from '../../lib/background-system.mjs';

const projectRoot = path.resolve('.');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eian-paper-ui-broll-skill-formal-'));
const jobsRoot = path.join(root, 'jobs');
const onePixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9JxE8AAAAASUVORK5CYII=', 'base64');
const dialogue = 'User: Keep the approved visual contract.\nAI: The formal renderer must preserve it exactly.';
const longDialogue = fs.readFileSync(path.join(projectRoot, 'examples', 'inputs', 'dialogue.long.txt'), 'utf8');

const idFactory = (id) => () => id;
const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const passingDoctor = () => ({ok:true, summary:'Environment ready.'});
const fakeGlobalPreview = ({workflowStatePath, outputPath}) => {
  fs.writeFileSync(outputPath, onePixelPng);
  let workflow = resolveBackgroundState(readState(workflowStatePath));
  workflow = markPreviewReady(workflow, {path:outputPath});
  writeState(workflowStatePath, workflow);
};
const fakeUserVisiblePreview = ({workflowStatePath, outputPath, userVisiblePart}) => {
  fs.writeFileSync(outputPath, onePixelPng);
  let workflow = readState(workflowStatePath);
  workflow = markPreviewReady(workflow, {path:outputPath, userVisiblePart});
  writeState(workflowStatePath, workflow);
};
const fakeRenderer = ({calls, failUserVisiblePart = null}) => ({workflowStatePath, outputPath, userVisiblePart}) => {
  calls.push(userVisiblePart);
  let workflow = readState(workflowStatePath);
  workflow = beginUserVisiblePartRender(workflow, userVisiblePart);
  writeState(workflowStatePath, workflow);
  if (userVisiblePart === failUserVisiblePart) {
    workflow = failUserVisiblePartRender(readState(workflowStatePath), userVisiblePart, 'INJECTED_PART_FAILURE');
    writeState(workflowStatePath, workflow);
    throw new Error('INJECTED_PART_FAILURE');
  }
  fs.writeFileSync(outputPath, `fake mp4 user-visible part ${userVisiblePart}\n`);
  workflow = completeUserVisiblePartRender(readState(workflowStatePath), userVisiblePart, outputPath);
  writeState(workflowStatePath, workflow);
};
const createJob = ({id, input = dialogue, templateId = 't01-reference-research-console', ratio = '9:16', resolution = '1080p'}) => createAndPrepareSkillJob({
  input:{type:'labelled-text', value:input}, selection:{templateId, ratio, resolution}, jobsRoot, projectRoot, idFactory:idFactory(id),
});
const approveGlobal = (job) => {
  generateSkillJobPreview({statePath:job.persistence.statePath, projectRoot, doctorRunner:passingDoctor, previewRunner:fakeGlobalPreview});
  return approveSkillJobPreview({statePath:job.persistence.statePath, projectRoot});
};
let fixtureSequence = 0;
const createWithPartCount = (count) => {
  fixtureSequence += 1;
  for (let repeats = 1; repeats <= 12; repeats += 1) {
    const job = createJob({id:`eian-formal-${fixtureSequence}-${count}-${repeats}`, input:longDialogue.repeat(repeats)});
    if (job.durationPlan.userVisibleParts.length === count) return job;
  }
  throw new Error(`Unable to build a ${count}-Part fixture.`);
};

try {
  assert.deepEqual(finalDimensionsFor('9:16', '720p'), {width:720, height:1280});
  assert.deepEqual(finalDimensionsFor('9:16', '1080p'), {width:1080, height:1920});
  assert.deepEqual(finalDimensionsFor('1:1', '720p'), {width:720, height:720});
  assert.deepEqual(finalDimensionsFor('1:1', '1080p'), {width:1080, height:1080});
  assert.deepEqual(finalDimensionsFor('16:9', '720p'), {width:1280, height:720});
  assert.deepEqual(finalDimensionsFor('16:9', '1080p'), {width:1920, height:1080});

  const single = approveGlobal(createJob({id:'eian-formal-single'}));
  const pending = noteSkillJobFinalResolutionChange({statePath:single.persistence.statePath, resolution:'720p', projectRoot});
  assert.throws(() => renderSkillJobFormal({statePath:pending.persistence.statePath, projectRoot, doctorRunner:passingDoctor}), /final parameters/i);
  const confirmed = confirmSkillJobFinalParameters({statePath:pending.persistence.statePath, projectRoot});
  assert.equal(confirmed.preview.finalParameterConfirmationPending, false);
  assert.deepEqual(confirmed.finalParameters.dimensions, {width:720, height:1280});
  const singleCalls = [];
  const renderedSingle = renderSkillJobFormal({statePath:pending.persistence.statePath, projectRoot, doctorRunner:passingDoctor, rendererRunner:fakeRenderer({calls:singleCalls})});
  assert.equal(renderedSingle.status, 'rendered');
  assert.deepEqual(singleCalls, [1]);
  assert.equal(renderedSingle.render.parts[0].filename, 'final.mp4');
  assert.equal(renderedSingle.render.parts[0].status, 'completed');
  assert.equal(fs.existsSync(path.join(renderedSingle.delivery.outputDirectory, 'final.mp4')), true);
  const finalizedSingle = finalizeSkillJobFormalRender({statePath:pending.persistence.statePath, projectRoot, finalizerRunner:() => ({cleaned:true})});
  assert.equal(finalizedSingle.status, 'completed');
  assert.equal(readJson(finalizedSingle.persistence.manifestPath).overallStatus, 'completed');

  const multipart = approveGlobal(createWithPartCount(3));
  confirmSkillJobFinalParameters({statePath:multipart.persistence.statePath, projectRoot});
  const failingCalls = [];
  const failed = renderSkillJobFormal({statePath:multipart.persistence.statePath, projectRoot, doctorRunner:passingDoctor, rendererRunner:fakeRenderer({calls:failingCalls, failUserVisiblePart:2})});
  assert.equal(failed.status, 'failed');
  assert.deepEqual(failingCalls, [1, 2]);
  assert.equal(failed.render.parts[0].status, 'completed');
  assert.equal(failed.render.parts[1].status, 'failed');
  assert.equal(failed.render.parts[2].status, 'pending');
  assert.equal(fs.existsSync(path.join(failed.delivery.outputDirectory, 'part-01.mp4')), true);
  assert.equal(fs.existsSync(path.join(failed.delivery.outputDirectory, 'part-02.mp4')), false);
  const failedManifest = readJson(failed.persistence.manifestPath);
  assert.equal(failedManifest.overallStatus, 'failed');
  assert.deepEqual(failedManifest.parts.map((part) => part.status), ['completed', 'failed', 'pending']);
  const retryCalls = [];
  const retried = retrySkillJobFormalRender({statePath:multipart.persistence.statePath, projectRoot, doctorRunner:passingDoctor, rendererRunner:fakeRenderer({calls:retryCalls})});
  assert.equal(retried.status, 'rendered');
  assert.deepEqual(retryCalls, [2, 3]);
  assert.equal(retried.render.retry.attempt, 1);
  assert.equal(retried.render.parts[0].attempts, 1);
  assert.equal(retried.render.parts[1].attempts, 2);
  assert.equal(retried.render.parts[2].attempts, 1);
  const retriedManifest = readJson(retried.persistence.manifestPath);
  assert.equal(retriedManifest.render.history.some((entry) => entry.type === 'formal-render-retry-started'), true);
  assert.deepEqual(retriedManifest.parts.map((part) => part.attempts), [1, 2, 1]);
  assert.equal(fs.existsSync(path.join(retried.delivery.outputDirectory, 'final.mp4')), false, 'Multipart delivery must never create an automatic merged final.mp4.');
  const finalMultipart = finalizeSkillJobFormalRender({statePath:multipart.persistence.statePath, projectRoot, finalizerRunner:() => ({cleaned:true})});
  assert.equal(finalMultipart.status, 'completed');
  assert.deepEqual(readJson(finalMultipart.persistence.manifestPath).parts.map((part) => part.status), ['completed', 'completed', 'completed']);

  const exceptionJob = approveGlobal(createWithPartCount(2));
  confirmSkillJobFinalParameters({statePath:exceptionJob.persistence.statePath, projectRoot});
  const exceptionCalls = [];
  const firstPart = renderSkillJobFormal({statePath:exceptionJob.persistence.statePath, projectRoot, doctorRunner:passingDoctor, rendererRunner:fakeRenderer({calls:exceptionCalls}), mode:'next'});
  assert.deepEqual(exceptionCalls, [1]);
  assert.equal(firstPart.render.parts[0].status, 'completed');
  const exceptionRequested = prepareSkillJobTwoPartTemplateException({statePath:exceptionJob.persistence.statePath, projectRoot, templateId:'t02-paper-dialogue'});
  assert.equal(exceptionRequested.status, 'awaitingPart2ExceptionPreview');
  assert.equal(exceptionRequested.locks.twoPartException.used, true);
  assert.equal(exceptionRequested.render.parts[1].templateId, 't02-paper-dialogue');
  const exceptionPreview = generateSkillJobUserVisiblePartPreview({statePath:exceptionJob.persistence.statePath, projectRoot, doctorRunner:passingDoctor, previewRunner:fakeUserVisiblePreview, userVisiblePart:2});
  assert.equal(exceptionPreview.preview.parts['2'].status, 'ready');
  const exceptionApproved = approveSkillJobUserVisiblePartPreview({statePath:exceptionJob.persistence.statePath, projectRoot, userVisiblePart:2});
  assert.equal(exceptionApproved.status, 'readyForRender');
  assert.equal(exceptionApproved.preview.parts['2'].approvalValid, true);
  const exceptionReconfirmed = confirmSkillJobFinalParameters({statePath:exceptionJob.persistence.statePath, projectRoot});
  assert.equal(exceptionReconfirmed.preview.finalParameterConfirmationPending, false);
  const exceptionRendered = renderSkillJobFormal({statePath:exceptionJob.persistence.statePath, projectRoot, doctorRunner:passingDoctor, rendererRunner:fakeRenderer({calls:exceptionCalls})});
  assert.deepEqual(exceptionCalls, [1, 2]);
  assert.equal(exceptionRendered.render.parts[1].templateId, 't02-paper-dialogue');
  const exceptionManifest = readJson(exceptionRendered.persistence.manifestPath);
  assert.deepEqual(exceptionManifest.parts.map((part) => part.templateId), ['t01-reference-research-console', 't02-paper-dialogue']);
  assert.equal(exceptionManifest.continuity.guarantee, false);
  assert.equal(exceptionManifest.continuity.twoPartExceptionUsed, true);

  const syncJob = approveGlobal(createJob({id:'eian-formal-manifest-sync'}));
  confirmSkillJobFinalParameters({statePath:syncJob.persistence.statePath, projectRoot});
  const syncCalls = [];
  let writeCount = 0;
  const flakyManifestWriter = ({skillJob}) => {
    writeCount += 1;
    if (writeCount === 3) throw new Error('INJECTED_MANIFEST_WRITE_FAILURE');
    return skillJob;
  };
  const syncPending = renderSkillJobFormal({statePath:syncJob.persistence.statePath, projectRoot, doctorRunner:passingDoctor, rendererRunner:fakeRenderer({calls:syncCalls}), manifestWriter:flakyManifestWriter});
  assert.equal(syncPending.status, 'manifestSyncPending');
  assert.deepEqual(syncCalls, [1]);
  assert.equal(fs.existsSync(path.join(syncPending.delivery.outputDirectory, 'final.mp4')), true);
  const repaired = repairSkillJobManifest({statePath:syncJob.persistence.statePath, projectRoot});
  assert.equal(repaired.render.manifestSyncPending, false);
  assert.equal(repaired.status, 'rendered');
  assert.deepEqual(syncCalls, [1], 'Repair must not re-render an already completed MP4.');
  assert.equal(readJson(repaired.persistence.manifestPath).overallStatus, 'rendered');

  const nonException = approveGlobal(createWithPartCount(3));
  confirmSkillJobFinalParameters({statePath:nonException.persistence.statePath, projectRoot});
  renderSkillJobFormal({statePath:nonException.persistence.statePath, projectRoot, doctorRunner:passingDoctor, rendererRunner:fakeRenderer({calls:[]}), mode:'next'});
  assert.throws(() => prepareSkillJobTwoPartTemplateException({statePath:nonException.persistence.statePath, projectRoot, templateId:'t02-paper-dialogue'}), /exactly two user-visible Parts/i);

  assert.equal(readPersistedSkillJob(exceptionJob.persistence.statePath).jobId, exceptionJob.jobId);
  console.log('Skill formal render lifecycle tests: PASS');
} finally {
  fs.rmSync(root, {recursive:true, force:true});
}
