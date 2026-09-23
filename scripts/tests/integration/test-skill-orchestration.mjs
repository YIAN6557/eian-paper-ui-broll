import assert from 'node:assert/strict';
import {
  WORKFLOW_ADAPTER_BOUNDARY,
  attachSkillSelection,
  attachUserVisiblePlan,
  buildDeliveryManifest,
  createSkillJob,
  normalizeSkillInput,
  planUserVisibleParts,
  resumeSkillJob,
  validateSkillSelection,
} from '../../lib/skill-orchestration.mjs';

const makeIdFactory = (...ids) => {
  let index = 0;
  return () => ids[index++] ?? `eian-skill-overflow-${index}`;
};

const timeline = (durationInFrames, assistantEnds = []) => ({
  fps: 24,
  durationInFrames,
  messages: assistantEnds.map((end, index) => ({
    id: `m${index + 1}`,
    speaker: 'assistant',
    typingStartFrame: Math.max(0, end - 48),
    revealStartFrame: end - 24,
    revealFrames: 24,
  })),
});

const segments = (ends) => ({
  fps: 24,
  parts: ends.map((end, index) => {
    const start = index === 0 ? 0 : ends[index - 1];
    return {
      part: index + 1,
      globalStartFrame: start,
      globalEndFrameExclusive: end,
      durationInFrames: end - start,
      durationSeconds: (end - start) / 24,
    };
  }),
});

const labelled = normalizeSkillInput({
  type: 'labelled-text',
  value: 'User: Keep this wording.\nAI: I will preserve it.',
});
assert.equal(labelled.type, 'labelled-text');
assert.deepEqual(labelled.messages.map((message) => message.speaker), ['user', 'assistant']);
assert.equal(labelled.messages[0].text, 'Keep this wording.');
assert.equal(labelled.messages[1].text, 'I will preserve it.');

const structured = normalizeSkillInput({
  type: 'structured-json',
  value: JSON.stringify({messages: [
    {role: 'user', content: 'Keep this exact message.'},
    {role: 'assistant', content: 'Keep this reply exact.'},
    {role: 'user', content: 'Do not merge this turn.'},
  ]}),
});
assert.equal(structured.type, 'structured-json');
assert.equal(structured.messages.length, 3, 'Structured input must not merge messages.');
assert.deepEqual(structured.messages.map((message) => message.text), [
  'Keep this exact message.',
  'Keep this reply exact.',
  'Do not merge this turn.',
]);
assert.throws(() => normalizeSkillInput({type: 'structured-json', value: '{not valid JSON'}), /Invalid structured JSON/);
assert.throws(() => normalizeSkillInput({
  type: 'structured-json',
  value: {messages: [{role: 'system', content: 'Unsupported'}]},
}), /Unsupported structured dialogue role/);

const idFactory = makeIdFactory('eian-skill-a1', 'eian-skill-b2');
const jobA = createSkillJob({
  normalizedInput: structured,
  originalInputReference: 'inputs/job-a.json',
  parsedDialogueReference: 'jobs/eian-skill-a1/parsed-dialogue.json',
  outputRoot: 'output',
  idFactory,
});
const jobB = createSkillJob({
  normalizedInput: labelled,
  outputRoot: 'output',
  idFactory,
});
assert.notEqual(jobA.jobId, jobB.jobId, 'Every new Skill job requires a unique id.');
assert.match(jobA.jobId, /^[a-z0-9][a-z0-9-]*$/, 'Job ids must be filesystem safe.');
assert.equal(jobA.delivery.outputDirectory, 'output/eian-skill-a1');
assert.equal(resumeSkillJob(jobA).jobId, jobA.jobId, 'Retry must retain the original job id.');
assert.equal(jobA.input.originalInputReference, 'inputs/job-a.json');
assert.equal(jobA.input.parsedDialogueReference, 'jobs/eian-skill-a1/parsed-dialogue.json');
assert.equal(jobA.input.inputHash, structured.inputHash);
assert.equal(jobA.preview.status, 'not_generated');
assert.equal(jobA.locks.templateLocked, false);
assert.equal(jobA.render.retry.attempt, 0);

for (const ratio of ['9:16', '1:1', '16:9']) {
  assert.equal(validateSkillSelection({templateId: 't01-reference-research-console', ratio}).ratio, ratio);
  assert.equal(validateSkillSelection({templateId: 't02-paper-dialogue', ratio}).ratio, ratio);
}
for (const ratio of ['9:16', '16:9']) {
  assert.equal(validateSkillSelection({templateId: 't03-keyflow', ratio}).ratio, ratio);
}
assert.throws(() => validateSkillSelection({templateId: 't03-keyflow', ratio: '1:1'}), /not enabled/);
assert.throws(() => validateSkillSelection({ratio: '9:16'}), /Template id is required/);
assert.throws(() => validateSkillSelection({templateId: 't01-reference-research-console'}), /Ratio is required/);
assert.equal(validateSkillSelection({templateId: 't01-reference-research-console', ratio: '9:16'}).resolution, '1080p');
assert.equal(validateSkillSelection({templateId: 't01-reference-research-console', ratio: '9:16', resolution: '720p'}).resolution, '720p');
assert.equal(validateSkillSelection({templateId: 't01-reference-research-console', ratio: '9:16'}).background.selection, 'b01-matte-paper');

const underTwenty = planUserVisibleParts({
  timeline: timeline(456, [456]),
  segmentManifest: segments([144, 288, 456]),
});
assert.equal(underTwenty.outputMode, 'single');
assert.equal(underTwenty.parts.length, 1);
assert.deepEqual(underTwenty.parts[0].internalSegmentIndexes, [1, 2, 3]);

const exactlyTwenty = planUserVisibleParts({
  timeline: timeline(480, [480]),
  segmentManifest: segments([168, 336, 480]),
});
assert.equal(exactlyTwenty.outputMode, 'single', 'Exactly 20 seconds remains one user-visible output.');
assert.equal(exactlyTwenty.parts[0].durationInFrames, 480);

const multipart = planUserVisibleParts({
  timeline: timeline(552, [432, 552]),
  segmentManifest: segments([144, 288, 432, 552]),
});
assert.equal(multipart.outputMode, 'multipart');
assert.equal(multipart.parts.length, 2);
assert.deepEqual(multipart.parts[0].internalSegmentIndexes, [1, 2, 3], 'Internal segments are grouped into one user-visible Part.');
assert.equal(multipart.parts.at(-1).durationInFrames, 120, 'A visibly short final Part is allowed.');
assert(multipart.parts.every((part) => part.durationInFrames <= 480), 'No user-visible Part may exceed 20 seconds.');

const semanticPreference = planUserVisibleParts({
  timeline: timeline(720, [288, 720]),
  segmentManifest: segments([144, 288, 432, 576, 720]),
});
assert.equal(semanticPreference.parts[0].timelineEnd, 288, 'Prefer a message boundary over a later non-semantic internal cut.');

const selectedJob = attachSkillSelection(jobA, validateSkillSelection({
  templateId: 't03-keyflow', ratio: '16:9', resolution: '720p', background: 'b01-matte-paper',
}));
const plannedJob = attachUserVisiblePlan(selectedJob, multipart);
const singleManifest = buildDeliveryManifest({
  skillJob: attachUserVisiblePlan(
    attachSkillSelection(jobB, validateSkillSelection({templateId: 't01-reference-research-console', ratio: '9:16'})),
    underTwenty,
  ),
  canonicalBuildIdentifier: 'test-build',
  skillVersion: 'test-version',
});
assert.equal(singleManifest.outputType, 'single');
assert.deepEqual(singleManifest.parts.map((part) => part.filename), ['final.mp4']);
assert(!JSON.stringify(singleManifest).includes('Keep this wording.'), 'Delivery manifest must not duplicate full dialogue text.');

const multipartManifest = buildDeliveryManifest({
  skillJob: plannedJob,
  canonicalBuildIdentifier: 'test-build',
  skillVersion: 'test-version',
});
assert.equal(multipartManifest.outputType, 'multipart');
assert.deepEqual(multipartManifest.parts.map((part) => part.filename), ['part-01.mp4', 'part-02.mp4']);
assert.equal(multipartManifest.partCount, 2);
assert.equal(multipartManifest.parts[0].templateId, 't03-keyflow');
assert.equal(multipartManifest.parts[0].status, 'pending');

assert.deepEqual(Object.keys(WORKFLOW_ADAPTER_BOUNDARY).sort(), [
  'approvePreview', 'doctor', 'finalize', 'prepare', 'preview', 'render', 'selectBackground', 'selectTemplate',
].sort());

console.log('Skill orchestration foundation tests: PASS');
