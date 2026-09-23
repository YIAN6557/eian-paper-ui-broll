import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  computeCanonicalBuildIdentifier,
  createAndPrepareSkillJob,
  readPersistedSkillJob,
  resolveCanonicalBuildIdentifier,
  resolveSourceBaseline,
  resumePersistedSkillJob,
  runSkillPreviewDoctor,
} from '../../lib/skill-job-lifecycle.mjs';
import {planUserVisibleParts} from '../../lib/skill-orchestration.mjs';

const projectRoot = path.resolve('.');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eian-paper-ui-broll-skill-job-'));
const jobsRoot = path.join(root, 'jobs');
const idFactory = (...ids) => {
  let index = 0;
  return () => ids[index++] ?? ('eian-skill-overflow-' + index);
};

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const dialogue = 'User: Please retain this exact wording.\nAI: I will retain this exact wording.';

let legacyBootstrapCalled = false;
const doctorReady = runSkillPreviewDoctor({
  projectRoot,
  bootstrapRunner:() => {
    legacyBootstrapCalled = true;
    return {ok:true, summary:'This must not install.'};
  },
  environmentDoctorRunner:() => ({ok:true, summary:'Environment ready.'}),
});
assert.deepEqual(doctorReady, {ok:true, summary:'Environment ready.'});
assert.equal(legacyBootstrapCalled, false, 'Preview and render lifecycle checks must never install dependencies.');

const doctorBlocked = runSkillPreviewDoctor({
  projectRoot,
  environmentDoctorRunner:() => ({ok:false, summary:'FFmpeg and ffprobe are unavailable.'}),
});
assert.deepEqual(doctorBlocked, {ok:false, summary:'FFmpeg and ffprobe are unavailable.'});

try {
  const labelled = createAndPrepareSkillJob({
    input: {type: 'labelled-text', value: dialogue, originalInputReference: 'fixtures/labelled-dialogue.txt'},
    selection: {templateId: 't01-reference-research-console', ratio: '9:16'},
    jobsRoot,
    projectRoot,
    idFactory: idFactory('eian-skill-labelled-a1'),
  });

  assert.equal(labelled.status, 'readyForPreview');
  assert.equal(labelled.jobId, 'eian-skill-labelled-a1');
  assert.match(labelled.jobId, /^[a-z0-9][a-z0-9-]*$/);
  assert.equal(labelled.selection.resolution, '1080p');
  assert.equal(labelled.selection.background.selection, 'b01-matte-paper');
  assert.equal(labelled.durationPlan.outputMode, 'single');
  assert.equal(labelled.durationPlan.userVisibleParts.length, 1);
  assert.equal(labelled.preview.status, 'not_generated');
  assert.equal(labelled.render.overallStatus, 'not_started');
  assert.equal(labelled.workflow.stateReference.endsWith('workflow-state.json'), true);
  assert.equal(fs.existsSync(labelled.persistence.jobDirectory), true);
  assert.equal(fs.existsSync(labelled.persistence.statePath), true);
  assert.equal(fs.existsSync(labelled.persistence.manifestPath), true);
  assert.equal(fs.existsSync(labelled.workflow.timelineReference), true);
  assert.equal(fs.existsSync(labelled.workflow.internalSegmentsReference), true);

  const reloaded = readPersistedSkillJob(labelled.persistence.statePath);
  const resumed = resumePersistedSkillJob(labelled.persistence.statePath);
  assert.equal(reloaded.jobId, labelled.jobId);
  assert.equal(resumed.jobId, labelled.jobId, 'Reopen/retry must retain its job identity.');
  assert.doesNotThrow(() => readJson(labelled.persistence.statePath), 'Atomically written Skill state must parse.');
  assert.doesNotThrow(() => readJson(labelled.persistence.manifestPath), 'Atomically written manifest must parse.');

  const workflowState = readJson(labelled.workflow.stateReference);
  assert.equal(workflowState.selection.template, 't01-reference-research-console');
  assert.equal(workflowState.input.ratio, '9:16');
  assert.equal(workflowState.selection.background, 'b01-matte-paper');
  assert.equal(workflowState.preview.global.status, 'not_generated');

  const singleManifest = readJson(labelled.persistence.manifestPath);
  assert.equal(singleManifest.jobId, labelled.jobId);
  assert.equal(singleManifest.overallStatus, 'readyForPreview');
  assert.equal(singleManifest.outputType, 'single');
  assert.deepEqual(singleManifest.parts.map((part) => part.filename), ['final.mp4']);
  assert.equal(singleManifest.templateId, labelled.selection.templateId);
  assert.equal(singleManifest.ratio, labelled.selection.ratio);
  assert.equal(singleManifest.resolution, labelled.selection.resolution);
  assert.equal(singleManifest.partCount, labelled.durationPlan.userVisibleParts.length);
  assert.equal(singleManifest.totalDuration.frames, labelled.durationPlan.compiledTotalDurationInFrames);
  assert.deepEqual(singleManifest.parts.map((part) => part.status), labelled.render.parts.map((part) => part.status));
  assert.deepEqual(singleManifest.parts.map((part) => part.filename), labelled.delivery.finalFilenames);
  assert(!JSON.stringify(singleManifest).includes('Please retain this exact wording.'), 'Manifest must not duplicate source dialogue.');
  assert.equal(fs.existsSync(path.join(labelled.persistence.jobDirectory, 'final.mp4')), false);

  const structuredMessages = [
    {role: 'user', content: 'First structured message.'},
    {role: 'assistant', content: 'First structured reply.'},
    {role: 'user', content: 'Second structured message.'},
  ];
  const structured = createAndPrepareSkillJob({
    input: {type: 'structured-json', value: JSON.stringify({messages: structuredMessages}), originalInputReference: 'fixtures/structured-dialogue.json'},
    selection: {templateId: 't03-keyflow', ratio: '16:9', resolution: '720p'},
    jobsRoot,
    projectRoot,
    idFactory: idFactory('eian-skill-structured-b2'),
  });
  assert.equal(structured.status, 'readyForPreview');
  assert.equal(structured.selection.templateId, 't03-keyflow');
  assert.equal(structured.selection.ratio, '16:9');
  assert.equal(structured.selection.resolution, '720p');
  assert.deepEqual(structured.input.normalizedInput.messages.map((message) => ({speaker: message.speaker, text: message.text})), [
    {speaker: 'user', text: 'First structured message.'},
    {speaker: 'assistant', text: 'First structured reply.'},
    {speaker: 'user', text: 'Second structured message.'},
  ]);
  const structuredTimeline = readJson(structured.workflow.timelineReference);
  assert.deepEqual(structuredTimeline.messages.map((message) => ({speaker: message.speaker, text: message.text})), [
    {speaker: 'user', text: 'First structured message.'},
    {speaker: 'assistant', text: 'First structured reply.'},
    {speaker: 'user', text: 'Second structured message.'},
  ]);
  assert.equal(readJson(structured.workflow.stateReference).selection.template, 't03-keyflow');

  const cliInputPath = path.join(root, 'cli-dialogue.txt');
  fs.writeFileSync(cliInputPath, dialogue);
  const cliSummary = JSON.parse(execFileSync(process.execPath, [
    'scripts/cli/skill-job.mjs', 'create',
    '--input', cliInputPath,
    '--input-type', 'labelled-text',
    '--template', 't01-reference-research-console',
    '--ratio', '16:9',
    '--jobs-root', jobsRoot,
  ], {cwd: projectRoot, encoding: 'utf8'}));
  assert.equal(cliSummary.status, 'readyForPreview');
  assert.equal(cliSummary.ratio, '16:9');
  assert.equal(fs.existsSync(cliSummary.statePath), true);
  assert.equal(fs.existsSync(cliSummary.manifestPath), true);

  const t02 = createAndPrepareSkillJob({
    input: {type: 'labelled-text', value: dialogue},
    selection: {templateId: 't02-paper-dialogue', ratio: '1:1', resolution: '720p'},
    jobsRoot,
    projectRoot,
    idFactory: idFactory('eian-skill-t02-c3'),
  });
  assert.equal(t02.status, 'readyForPreview');
  assert.equal(t02.selection.templateId, 't02-paper-dialogue');
  assert.equal(t02.selection.ratio, '1:1');
  assert.equal(t02.selection.resolution, '720p');

  const canonicalBuildIdentifier = resolveCanonicalBuildIdentifier(projectRoot);
  assert.equal(canonicalBuildIdentifier, resolveCanonicalBuildIdentifier(projectRoot), 'An unchanged Canonical Source must produce the same build identifier.');
  assert.match(canonicalBuildIdentifier, /^sha256:[0-9a-f]{64}$/);
  assert.equal(singleManifest.canonicalBuildIdentifier, canonicalBuildIdentifier);
  assert.equal(singleManifest.sourceBaseline, resolveSourceBaseline(projectRoot));
  assert.notEqual(singleManifest.canonicalBuildIdentifier, singleManifest.sourceBaseline, 'A current build fingerprint must not be a historical baseline reference.');

  const fingerprintFixtureRoot = fs.mkdtempSync(path.join(root, 'canonical-build-fingerprint-'));
  const fingerprintSourcePath = path.join(fingerprintFixtureRoot, 'skill-contract.txt');
  const fingerprintEntryPath = path.join(fingerprintFixtureRoot, 'skill-entry.txt');
  fs.writeFileSync(fingerprintSourcePath, 'first canonical source bytes\n');
  fs.writeFileSync(fingerprintEntryPath, 'first Skill entry bytes\n');
  const fingerprintOptions = {projectRoot: fingerprintFixtureRoot, files: ['skill-contract.txt', 'skill-entry.txt']};
  const fingerprintBefore = computeCanonicalBuildIdentifier(fingerprintOptions);
  assert.match(fingerprintBefore, /^sha256:[0-9a-f]{64}$/);
  assert.equal(computeCanonicalBuildIdentifier(fingerprintOptions), fingerprintBefore, 'Fingerprinting an unchanged fixture must be deterministic.');
  assert.equal(
    computeCanonicalBuildIdentifier({projectRoot: fingerprintFixtureRoot, files: ['skill-entry.txt', 'skill-contract.txt']}),
    fingerprintBefore,
    'Fingerprinting must use stable path ordering instead of caller ordering.',
  );
  fs.mkdirSync(path.join(fingerprintFixtureRoot, 'temp'), {recursive: true});
  fs.writeFileSync(path.join(fingerprintFixtureRoot, 'temp', 'manifest.json'), '{\"runtime\":true}\n');
  assert.equal(computeCanonicalBuildIdentifier(fingerprintOptions), fingerprintBefore, 'Runtime output outside the explicit source list must not change the fingerprint.');
  fs.writeFileSync(fingerprintSourcePath, 'changed canonical source bytes\n');
  assert.notEqual(computeCanonicalBuildIdentifier(fingerprintOptions), fingerprintBefore, 'Changing an included canonical source file must change the fingerprint.');

  const makeTimeline = (durationInFrames, assistantEnds = []) => ({
    fps: 24,
    durationInFrames,
    messages: assistantEnds.map((end, index) => ({
      id: `m${index + 1}`,
      speaker: 'assistant',
      typingStartFrame: end - 48,
      revealStartFrame: end - 24,
      revealFrames: 24,
    })),
  });
  const makeSegments = (ends) => ({
    fps: 24,
    parts: ends.map((end, index) => ({
      part: index + 1,
      globalStartFrame: index === 0 ? 0 : ends[index - 1],
      globalEndFrameExclusive: end,
    })),
  });
  assert.equal(planUserVisibleParts({timeline: makeTimeline(456, [456]), segmentManifest: makeSegments([144, 288, 456])}).outputMode, 'single');
  assert.equal(planUserVisibleParts({timeline: makeTimeline(480, [480]), segmentManifest: makeSegments([168, 336, 480])}).outputMode, 'single');
  const multipart = planUserVisibleParts({timeline: makeTimeline(552, [432, 552]), segmentManifest: makeSegments([144, 288, 432, 552])});
  assert.equal(multipart.outputMode, 'multipart');
  assert(multipart.parts.every((part) => part.durationInFrames <= 480));
  assert.equal(multipart.parts.at(-1).durationInFrames, 120);
  const semantic = planUserVisibleParts({timeline: makeTimeline(720, [288, 720]), segmentManifest: makeSegments([144, 288, 432, 576, 720])});
  assert.equal(semantic.parts[0].timelineEnd, 288);
  assert.throws(() => planUserVisibleParts({
    timeline: makeTimeline(481, [481]),
    segmentManifest: makeSegments([481]),
  }), /NEEDS USER DECISION: INTERNAL_SEGMENT_EXCEEDS_20_SECONDS/);

  const expectFailedJob = ({input, selection, jobId}) => {
    let error;
    try {
      createAndPrepareSkillJob({input, selection, jobsRoot, projectRoot, idFactory: idFactory(jobId)});
    } catch (caught) {
      error = caught;
    }
    assert(error, 'Invalid input or selection must fail the Skill job.');
    assert.equal(error.skillJobId, jobId);
    const failed = readPersistedSkillJob(error.skillJobStatePath);
    assert.equal(failed.status, 'failed');
    assert.notEqual(failed.status, 'readyForPreview');
    assert.equal(fs.existsSync(failed.persistence.statePath), true);
  };

  expectFailedJob({
    input: {type: 'structured-json', value: '{invalid json'},
    selection: {templateId: 't01-reference-research-console', ratio: '9:16'},
    jobId: 'eian-skill-invalid-d4',
  });
  expectFailedJob({
    input: {type: 'structured-json', value: {messages: [{role: 'system', content: 'Unsupported'}]}},
    selection: {templateId: 't01-reference-research-console', ratio: '9:16'},
    jobId: 'eian-skill-role-e5',
  });
  expectFailedJob({
    input: {type: 'labelled-text', value: dialogue},
    selection: {templateId: 't03-keyflow', ratio: '1:1'},
    jobId: 'eian-skill-ratio-f6',
  });

  console.log('Skill job lifecycle integration tests: PASS');
} finally {
  fs.rmSync(root, {recursive: true, force: true});
}
