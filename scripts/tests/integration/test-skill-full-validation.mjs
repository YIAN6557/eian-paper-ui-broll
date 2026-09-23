import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
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
  prepareSkillJobTwoPartTemplateException,
  readPersistedSkillJob,
  renderSkillJobFormal,
  resolveCanonicalBuildIdentifier,
} from '../../lib/skill-job-lifecycle.mjs';
import {finalDimensionsFor} from '../../lib/skill-orchestration.mjs';
import {templateRegistry} from '../../../src/templates/registry.mjs';

const projectRoot = path.resolve('.');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eian-paper-ui-broll-skill-full-validation-'));
const jobsRoot = path.join(root, 'jobs');
const shortLabelledDialogue = 'User: Preserve the approved Paper UI contract.\nAI: I will prepare the Preview before formal video rendering.';
const shortStructuredDialogue = JSON.stringify({messages:[
  {role:'user', content:'Please preserve these structured dialogue turns.'},
  {role:'assistant', content:'The Skill will preserve their order and meaning.'},
  {role:'user', content:'Use the approved paper dialogue presentation.'},
]});
const longDialogue = fs.readFileSync(path.join(projectRoot, 'examples', 'inputs', 'dialogue.long.txt'), 'utf8');
let sequence = 0;
const idFactory = (prefix) => () => `${prefix}-${++sequence}`;
const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const pngDimensions = (filePath) => {
  const bytes = fs.readFileSync(filePath);
  assert.equal(bytes.subarray(1, 4).toString('ascii'), 'PNG', 'Preview must be a PNG.');
  return {width:bytes.readUInt32BE(16), height:bytes.readUInt32BE(20)};
};

const probe = (outputPath) => JSON.parse(execFileSync('ffprobe', [
  '-v', 'error', '-select_streams', 'v:0', '-count_frames',
  '-show_entries', 'stream=codec_name,width,height,r_frame_rate,nb_read_frames:format=duration',
  '-of', 'json', outputPath,
], {encoding:'utf8'}));

const assertMedia = ({skillJob, expectedDimensions}) => {
  for (const part of skillJob.render.parts) {
    const outputPath = path.join(skillJob.delivery.outputDirectory, part.filename);
    assert.equal(fs.existsSync(outputPath), true, `${part.filename} must exist.`);
    assert(fs.statSync(outputPath).size > 0, `${part.filename} must be non-empty.`);
    const metadata = probe(outputPath);
    const stream = metadata.streams?.[0];
    assert.equal(stream?.codec_name, 'h264', `${part.filename} must use H.264.`);
    assert.equal(stream?.width, expectedDimensions.width, `${part.filename} width mismatch.`);
    assert.equal(stream?.height, expectedDimensions.height, `${part.filename} height mismatch.`);
    assert.equal(stream?.r_frame_rate, '24/1', `${part.filename} must use 24fps.`);
    assert.equal(Number(stream?.nb_read_frames), part.duration.frames, `${part.filename} frame count must equal the planned range.`);
    assert(Math.abs(Number(metadata.format.duration) - part.duration.seconds) < 0.1, `${part.filename} duration must match its plan.`);
  }
};

const expectedSourceRange = (timeline, start, end) => timeline.messages.filter((message) => {
  const messageStart = message.speaker === 'user'
    ? Number(message.startFrame ?? 0)
    : Number(message.typingStartFrame ?? 0);
  const messageEnd = message.speaker === 'user'
    ? messageStart + Number(message.enterFrames ?? 0)
    : Number(message.revealStartFrame ?? messageStart) + Number(message.revealFrames ?? 0);
  return messageStart < end && messageEnd > start;
}).map((message) => message.id);

const create = ({prefix, inputType = 'labelled-text', input, templateId, ratio, resolution}) => createAndPrepareSkillJob({
  input:{type:inputType, value:input},
  selection:{templateId, ratio, resolution},
  jobsRoot,
  projectRoot,
  idFactory:idFactory(prefix),
});

const approveExistingPreviewAndConfirm = (job) => {
  const approved = approveSkillJobPreview({statePath:job.persistence.statePath, projectRoot});
  assert.equal(approved.status, 'readyForRender');
  assert.equal(approved.preview.approvalValid, true);
  const confirmed = confirmSkillJobFinalParameters({statePath:job.persistence.statePath, projectRoot});
  assert.equal(confirmed.preview.finalParameterConfirmationPending, false);
  return confirmed;
};

const renderAndFinalize = (job, expectedDimensions) => {
  const rendered = renderSkillJobFormal({statePath:job.persistence.statePath, projectRoot});
  assert.equal(rendered.status, 'rendered');
  assert.equal(rendered.render.overallStatus, 'completed');
  assert.equal(rendered.doctor.status, 'passed', 'Formal Render must run the existing doctor.');
  assertMedia({skillJob:rendered, expectedDimensions});
  const beforeFinalize = readJson(rendered.persistence.manifestPath);
  assert.equal(beforeFinalize.canonicalBuildIdentifier, resolveCanonicalBuildIdentifier(projectRoot));
  assert.match(beforeFinalize.canonicalBuildIdentifier, /^sha256:[0-9a-f]{64}$/);
  assert.notEqual(beforeFinalize.canonicalBuildIdentifier, beforeFinalize.sourceBaseline);
  assert.equal(JSON.stringify(beforeFinalize).includes(shortLabelledDialogue), false, 'Manifest must not duplicate source dialogue.');
  const preFinalize = {
    timeline: readJson(rendered.workflow.timelineReference),
    internalSegments: readJson(rendered.workflow.internalSegmentsReference),
    renderHistory: beforeFinalize.render.history,
  };
  const finalized = finalizeSkillJobFormalRender({statePath:rendered.persistence.statePath, projectRoot});
  assert.equal(finalized.status, 'completed');
  const manifest = readJson(finalized.persistence.manifestPath);
  assert.equal(manifest.overallStatus, 'completed');
  assert.equal(manifest.renderStatus, 'completed');
  return {skillJob:finalized, manifest, preFinalize};
};

const createWithPartCount = (partCount, prefix) => {
  for (let repeat = 1; repeat <= 14; repeat += 1) {
    const job = create({
      prefix:`${prefix}-${repeat}`,
      input:longDialogue.repeat(repeat),
      templateId:'t01-reference-research-console',
      ratio:'9:16',
      resolution:'720p',
    });
    if (job.durationPlan.userVisibleParts.length === partCount) return job;
  }
  throw new Error(`Could not create a ${partCount}-Part full-validation fixture.`);
};

const assertPrepareFailure = ({jobId, input}) => {
  let failure = null;
  try {
    createAndPrepareSkillJob({
      input,
      selection:{templateId:'t01-reference-research-console', ratio:'9:16'},
      jobsRoot,
      projectRoot,
      idFactory:() => jobId,
    });
  } catch (error) {
    failure = error;
  }
  assert(failure, 'Invalid input must fail job preparation.');
  assert.equal(failure.skillJobId, jobId, 'Preparation failure must retain its generated job identity.');
  const failed = readPersistedSkillJob(failure.skillJobStatePath);
  assert.equal(failed.jobId, jobId);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.render.overallStatus, 'failed');
  assert.equal(fs.existsSync(path.join(failed.persistence.jobDirectory, 'preview-r01.png')), false);
  assert.equal(fs.existsSync(path.join(failed.persistence.jobDirectory, 'final.mp4')), false);
  assert.equal(fs.existsSync(path.join(failed.persistence.jobDirectory, 'part-01.mp4')), false);
};

try {
  const skill = fs.readFileSync(path.join(projectRoot, 'SKILL.md'), 'utf8');
  const contract = fs.readFileSync(path.join(projectRoot, 'docs/architecture/skill-production-contract.md'), 'utf8');
  assert(skill.includes('docs/architecture/skill-production-contract.md'), 'SKILL.md must route to the production contract.');
  assert(skill.includes('docs/setup/runtime-dependencies.md'), 'SKILL.md must route to the runtime dependency authority.');
  for (const required of [
    'T03 不支持 1:1', '`1080p`：默认', '720p static', 'Preview 是强制步骤',
    '20 秒或以下', '超过 20 秒', '每个 Part 均不超过 20 秒',
    '`final.mp4`', '`part-01.mp4`', '`manifest.json`', 'continuityGuarantee: false',
  ]) assert(contract.includes(required), `Production contract must retain current behavior: ${required}`);
  for (const forbidden of ['productionEnabled', 'productionValidationCandidate', '--validation-candidate']) {
    assert.equal(skill.includes(forbidden), false, `SKILL.md must not expose ${forbidden}.`);
  }
  assert(contract.includes('The user must explicitly select the template.'), 'Production contract must retain explicit template selection.');
  assert(contract.includes('The user must explicitly select a ratio.'), 'Production contract must retain explicit ratio selection.');

  const expectedTemplates = {
    't01-reference-research-console':['9:16', '1:1', '16:9'],
    't02-paper-dialogue':['9:16', '1:1', '16:9'],
    't03-keyflow':['9:16', '16:9'],
  };
  for (const [templateId, ratios] of Object.entries(expectedTemplates)) {
    assert.equal(templateRegistry[templateId]?.productionEnabled, true, `${templateId} must remain a production template.`);
    assert.deepEqual(templateRegistry[templateId]?.ratios, ratios, `${templateId} ratio matrix mismatch.`);
  }
  assert.throws(() => create({prefix:'t03-square-rejected', input:shortLabelledDialogue, templateId:'t03-keyflow', ratio:'1:1', resolution:'720p'}), /not enabled/);

  const dimensions = {
    '9:16':{'720p':{width:720, height:1280}, '1080p':{width:1080, height:1920}},
    '1:1':{'720p':{width:720, height:720}, '1080p':{width:1080, height:1080}},
    '16:9':{'720p':{width:1280, height:720}, '1080p':{width:1920, height:1080}},
  };
  for (const [ratio, resolutions] of Object.entries(dimensions)) {
    for (const [resolution, expected] of Object.entries(resolutions)) {
      assert.deepEqual(finalDimensionsFor(ratio, resolution), expected, `${ratio} ${resolution} mapping mismatch.`);
    }
  }

  assertPrepareFailure({jobId:'invalid-json-retained', input:{type:'structured-json', value:'{invalid json'}});
  assertPrepareFailure({jobId:'invalid-role-retained', input:{type:'structured-json', value:JSON.stringify({messages:[{role:'system', content:'not supported'}]})}});
  assertPrepareFailure({jobId:'empty-content-retained', input:{type:'structured-json', value:JSON.stringify({messages:[{role:'user', content:'   '}, {role:'assistant', content:'reply'}]})}});

  // Scenario A: real Preview r01 → rejection → preserved revision r02 → approval → 1080p formal T01 single.
  const t01Draft = create({prefix:'t01-short-single', input:shortLabelledDialogue, templateId:'t01-reference-research-console', ratio:'9:16', resolution:'1080p'});
  assert.equal(t01Draft.durationPlan.outputMode, 'single');
  const t01PreviewR01 = generateSkillJobPreview({statePath:t01Draft.persistence.statePath, projectRoot});
  assert.deepEqual(pngDimensions(t01PreviewR01.preview.artifact), {width:720, height:1280});
  const rejected = (await import('../../lib/skill-job-lifecycle.mjs')).rejectSkillJobPreview({statePath:t01Draft.persistence.statePath, reason:'Retain only the approved visual contract.', projectRoot});
  assert.equal(rejected.preview.status, 'rejected');
  assert.equal(rejected.preview.history[0].artifact, t01PreviewR01.preview.artifact);
  const t01PreviewR02 = generateSkillJobPreview({statePath:t01Draft.persistence.statePath, projectRoot});
  assert.equal(t01PreviewR02.preview.revision, 2);
  assert.equal(fs.existsSync(t01PreviewR01.preview.artifact), true, 'Rejected Preview r01 must be retained during the active job.');
  const t01Approved = approveSkillJobPreview({statePath:t01Draft.persistence.statePath, projectRoot});
  const t01Confirmed = confirmSkillJobFinalParameters({statePath:t01Approved.persistence.statePath, projectRoot});
  const t01 = renderAndFinalize(t01Confirmed, {width:1080, height:1920});
  assert.deepEqual(t01.manifest.parts.map((part) => part.filename), ['final.mp4']);
  assert.equal(fs.existsSync(path.join(t01.skillJob.delivery.outputDirectory, 'part-01.mp4')), false);
  assert.equal(fs.existsSync(path.join(t01.skillJob.delivery.outputDirectory, 'combined.mp4')), false);
  assert.equal(t01.manifest.preview.revision, 2);
  assert.equal(t01.manifest.preview.status, 'approved');

  // Scenario B: structured JSON exercises the real T02 1:1 720p lifecycle.
  const t02Draft = create({prefix:'t02-short-single', inputType:'structured-json', input:shortStructuredDialogue, templateId:'t02-paper-dialogue', ratio:'1:1', resolution:'720p'});
  assert.deepEqual(t02Draft.input.normalizedInput.messages.map((message) => message.speaker), ['user', 'assistant', 'user']);
  const t02Preview = generateSkillJobPreview({statePath:t02Draft.persistence.statePath, projectRoot});
  assert.deepEqual(pngDimensions(t02Preview.preview.artifact), {width:720, height:720});
  const t02 = renderAndFinalize(approveExistingPreviewAndConfirm(t02Draft), {width:720, height:720});
  assert.deepEqual(t02.manifest.parts.map((part) => part.filename), ['final.mp4']);

  // Scenario C: real T03 16:9 1080p lifecycle.
  const t03Draft = create({prefix:'t03-short-single', input:shortLabelledDialogue, templateId:'t03-keyflow', ratio:'16:9', resolution:'1080p'});
  const t03Preview = generateSkillJobPreview({statePath:t03Draft.persistence.statePath, projectRoot});
  assert.deepEqual(pngDimensions(t03Preview.preview.artifact), {width:1280, height:720});
  const t03 = renderAndFinalize(approveExistingPreviewAndConfirm(t03Draft), {width:1920, height:1080});
  assert.deepEqual(t03.manifest.parts.map((part) => part.filename), ['final.mp4']);

  // General multi-Part validation: three user-visible Parts, one global Preview, serial formal output.
  const multipartDraft = createWithPartCount(3, 't01-three-part');
  assert.equal(multipartDraft.durationPlan.outputMode, 'multipart');
  assert.equal(multipartDraft.durationPlan.userVisibleParts.length, 3);
  const multipartPreview = generateSkillJobPreview({statePath:multipartDraft.persistence.statePath, projectRoot});
  assert.deepEqual(pngDimensions(multipartPreview.preview.artifact), {width:720, height:1280});
  assert.equal(Object.keys(multipartPreview.preview.parts ?? {}).length, 0, 'A normal multi-Part job must have one global Preview only.');
  const multipart = renderAndFinalize(approveExistingPreviewAndConfirm(multipartDraft), {width:720, height:1280});
  assert.deepEqual(multipart.manifest.parts.map((part) => part.filename), ['part-01.mp4', 'part-02.mp4', 'part-03.mp4']);
  assert.equal(fs.existsSync(path.join(multipart.skillJob.delivery.outputDirectory, 'final.mp4')), false);
  assert.equal(fs.existsSync(path.join(multipart.skillJob.delivery.outputDirectory, 'combined.mp4')), false);
  assert(multipart.manifest.parts.every((part) => part.duration.frames <= 480), 'Every user-visible Part must be <= 20 seconds.');
  assert(multipart.manifest.parts.every((part) => part.templateId === 't01-reference-research-console'), 'Normal multi-Part rendering must preserve the template lock.');
  assert.deepEqual(multipart.manifest.parts.map((part) => part.status), ['completed', 'completed', 'completed']);
  assert.deepEqual(multipart.manifest.parts.map((part) => part.timelineStart), [0, ...multipart.manifest.parts.slice(0, -1).map((part) => part.timelineEnd)]);
  const multipartTimeline = multipart.preFinalize.timeline;
  const internalSegments = multipart.preFinalize.internalSegments.parts;
  for (const part of multipart.manifest.parts) {
    assert(internalSegments.some((segment) => Number(segment.globalStartFrame) === part.timelineStart), 'Part must start at an internal boundary.');
    assert(internalSegments.some((segment) => Number(segment.globalEndFrameExclusive) === part.timelineEnd), 'Part must end at an internal boundary.');
    assert.deepEqual(part.sourceRange.messageIds, expectedSourceRange(multipartTimeline, part.timelineStart, part.timelineEnd), 'Part source range must match the compiled dialogue.');
  }
  const starts = multipart.preFinalize.renderHistory.filter((entry) => entry.type === 'user-visible-part-render-started').map((entry) => entry.part);
  assert.deepEqual(starts, [1, 2, 3], 'Formal user-visible Parts must render serially.');

  // The sole Two-Part exception must use real Part-2 Preview and real override rendering.
  const exceptionDraft = createWithPartCount(2, 't01-two-part-exception');
  const exceptionOriginal = {
    ratio:exceptionDraft.selection.ratio,
    resolution:exceptionDraft.selection.resolution,
    background:exceptionDraft.selection.background.selection,
  };
  assert.throws(
    () => prepareSkillJobTwoPartTemplateException({statePath:exceptionDraft.persistence.statePath, projectRoot, templateId:'t02-paper-dialogue'}),
    /completed Part 1/i,
    'The exception must reject before Part 1 completes.',
  );
  const exceptionGlobalPreview = generateSkillJobPreview({statePath:exceptionDraft.persistence.statePath, projectRoot});
  assert.deepEqual(pngDimensions(exceptionGlobalPreview.preview.artifact), {width:720, height:1280});
  const exceptionApproved = approveExistingPreviewAndConfirm(exceptionDraft);
  const exceptionPartOne = renderSkillJobFormal({statePath:exceptionApproved.persistence.statePath, projectRoot, mode:'next'});
  assert.equal(exceptionPartOne.status, 'awaitingNextPart');
  assert.deepEqual(exceptionPartOne.render.parts.map((part) => part.status), ['completed', 'pending']);
  const exceptionRequested = prepareSkillJobTwoPartTemplateException({
    statePath:exceptionPartOne.persistence.statePath,
    projectRoot,
    templateId:'t02-paper-dialogue',
  });
  assert.equal(exceptionRequested.status, 'awaitingPart2ExceptionPreview');
  assert.equal(exceptionRequested.render.parts[0].templateId, 't01-reference-research-console');
  assert.equal(exceptionRequested.render.parts[1].templateId, 't02-paper-dialogue');
  assert.deepEqual(
    {ratio:exceptionRequested.selection.ratio, resolution:exceptionRequested.selection.resolution, background:exceptionRequested.selection.background.selection},
    exceptionOriginal,
    'The Two-Part exception must not change ratio, resolution, or background.',
  );
  assert.throws(
    () => renderSkillJobFormal({statePath:exceptionRequested.persistence.statePath, projectRoot}),
    /readyForRender/i,
    'Part 2 must not render before its exception Preview is approved.',
  );
  const exceptionPreview = generateSkillJobUserVisiblePartPreview({statePath:exceptionRequested.persistence.statePath, projectRoot, userVisiblePart:2});
  assert.deepEqual(pngDimensions(exceptionPreview.preview.parts['2'].artifact), {width:720, height:1280});
  const exceptionWorkflow = readJson(exceptionPreview.workflow.stateReference);
  assert.equal(exceptionWorkflow.preview.userVisibleParts['2'].status, 'ready');
  const exceptionPartPlan = exceptionWorkflow.userVisibleParts.find((part) => Number(part.index) === 2);
  assert.deepEqual(
    {start:exceptionPartPlan.timelineStart, end:exceptionPartPlan.timelineEnd},
    {start:exceptionPreview.render.parts[1].timelineStart, end:exceptionPreview.render.parts[1].timelineEnd},
    'The existing user-visible Part 2 mapping must cover the complete exception Preview range.',
  );
  const exceptionPartTwoApproved = approveSkillJobUserVisiblePartPreview({statePath:exceptionPreview.persistence.statePath, projectRoot, userVisiblePart:2});
  assert.equal(exceptionPartTwoApproved.preview.parts['2'].approvalValid, true);
  const exceptionReconfirmed = confirmSkillJobFinalParameters({statePath:exceptionPartTwoApproved.persistence.statePath, projectRoot});
  const exceptionRendered = renderSkillJobFormal({statePath:exceptionReconfirmed.persistence.statePath, projectRoot});
  assertMedia({skillJob:exceptionRendered, expectedDimensions:{width:720, height:1280}});
  const exceptionManifestBeforeFinalize = readJson(exceptionRendered.persistence.manifestPath);
  assert.deepEqual(exceptionManifestBeforeFinalize.parts.map((part) => part.templateId), ['t01-reference-research-console', 't02-paper-dialogue']);
  assert.equal(exceptionManifestBeforeFinalize.lock.twoPartException.used, true);
  assert.equal(exceptionManifestBeforeFinalize.continuity.twoPartExceptionUsed, true);
  assert.equal(exceptionManifestBeforeFinalize.continuity.guarantee, false);
  const exceptionFinal = finalizeSkillJobFormalRender({statePath:exceptionRendered.persistence.statePath, projectRoot});
  assert.equal(exceptionFinal.status, 'completed');
  assert.throws(
    () => prepareSkillJobTwoPartTemplateException({statePath:exceptionFinal.persistence.statePath, projectRoot, templateId:'t03-keyflow'}),
    /requires a completed Part 1 and an unstarted Part 2/i,
    'The exception must reject once Part 2 has started or completed.',
  );

  console.log('Skill full validation E2E tests: PASS');
} finally {
  fs.rmSync(root, {recursive:true, force:true});
}
