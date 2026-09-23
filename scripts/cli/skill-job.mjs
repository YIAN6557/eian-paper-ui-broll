#!/usr/bin/env node
import path from 'node:path';
import {
  approveSkillJobPreview,
  approveSkillJobUserVisiblePartPreview,
  confirmSkillJobFinalParameters,
  createAndPrepareSkillJob,
  finalizeSkillJobFormalRender,
  generateSkillJobPreview,
  generateSkillJobUserVisiblePartPreview,
  invalidateSkillJobPreviewApproval,
  noteSkillJobFinalResolutionChange,
  prepareSkillJobTwoPartTemplateException,
  readPersistedSkillJob,
  readSkillJobInputFile,
  rejectSkillJobPreview,
  renderSkillJobFormal,
  retrySkillJobFormalRender,
  skillJobSummary,
} from '../lib/skill-job-lifecycle.mjs';

const [command, ...argv] = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const index = argv.indexOf(name);
  return index >= 0 && index + 1 < argv.length ? argv[index + 1] : fallback;
};
const jobsRoot = path.resolve(arg('--jobs-root', 'temp/skill-jobs'));
const statePathForJob = () => {
  const jobId = arg('--job');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(String(jobId ?? ''))) {
    throw new Error('--job must be a filesystem-safe Skill job id.');
  }
  return path.join(jobsRoot, jobId, 'skill-job.json');
};
const print = (skillJob) => console.log(JSON.stringify(skillJobSummary(skillJob), null, 2));

if (command === 'create') {
  const inputPath = arg('--input');
  if (!inputPath) throw new Error('--input is required.');
  const templateId = arg('--template');
  const ratio = arg('--ratio');
  const inputType = arg('--input-type', 'labelled-text');
  const source = readSkillJobInputFile(inputPath);
  print(createAndPrepareSkillJob({
    input: {type: inputType, ...source},
    selection: {
      templateId,
      ratio,
      ...(arg('--resolution') ? {resolution: arg('--resolution')} : {}),
      ...(arg('--background') ? {background: arg('--background')} : {}),
    },
    jobsRoot,
    ...(arg('--task') ? {taskText: arg('--task')} : {}),
  }));
} else if (command === 'preview') {
  print(generateSkillJobPreview({statePath: statePathForJob()}));
} else if (command === 'approve-preview') {
  print(approveSkillJobPreview({statePath: statePathForJob()}));
} else if (command === 'reject-preview') {
  print(rejectSkillJobPreview({statePath: statePathForJob(), reason: arg('--reason')}));
} else if (command === 'invalidate-preview') {
  const changedFields = String(arg('--changed', '')).split(',').map((value) => value.trim()).filter(Boolean);
  print(invalidateSkillJobPreviewApproval({statePath: statePathForJob(), changedFields}));
} else if (command === 'set-final-resolution') {
  print(noteSkillJobFinalResolutionChange({statePath: statePathForJob(), resolution: arg('--resolution')}));
} else if (command === 'confirm-final') {
  print(confirmSkillJobFinalParameters({statePath: statePathForJob()}));
} else if (command === 'render') {
  print(renderSkillJobFormal({statePath: statePathForJob(), mode: arg('--mode', 'all')}));
} else if (command === 'retry') {
  print(retrySkillJobFormalRender({statePath: statePathForJob(), mode: arg('--mode', 'all')}));
} else if (command === 'finalize') {
  print(finalizeSkillJobFormalRender({statePath: statePathForJob()}));
} else if (command === 'set-part-2-template') {
  print(prepareSkillJobTwoPartTemplateException({statePath: statePathForJob(), templateId: arg('--template')}));
} else if (command === 'preview-part-2') {
  print(generateSkillJobUserVisiblePartPreview({statePath: statePathForJob(), userVisiblePart: 2}));
} else if (command === 'approve-part-2-preview') {
  print(approveSkillJobUserVisiblePartPreview({statePath: statePathForJob(), userVisiblePart: 2}));
} else if (command === 'show') {
  print(readPersistedSkillJob(statePathForJob()));
} else {
  throw new Error('Usage: skill-job.mjs <create|preview|approve-preview|reject-preview|invalidate-preview|set-final-resolution|confirm-final|render|retry|finalize|set-part-2-template|preview-part-2|approve-part-2-preview|show> [arguments]');
}
