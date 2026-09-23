import crypto from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compileTimeline} from './timeline-compiler.mjs';
import {segmentTimeline} from './timeline-segmenter.mjs';
import {applyTemplateTimingToState} from './template-timing.mjs';
import {chooseRepresentativeFrame} from './preview-frame.mjs';
import {
  approvePreview as approveWorkflowPreview,
  attachUserVisibleParts,
  invalidatePreviewApproval as invalidateWorkflowPreviewApproval,
  makeWorkflowState,
  readState as readWorkflowState,
  selectBackground,
  selectTemplate,
  writeState as writeWorkflowState,
} from './workflow-state.mjs';
import {
  attachSkillSelection,
  attachUserVisiblePlan,
  buildDeliveryManifest,
  createSkillJob,
  createSkillJobId,
  normalizeSkillInput,
  planUserVisibleParts,
  resumeSkillJob,
  validateSkillSelection,
  finalDimensionsFor,
} from './skill-orchestration.mjs';
import {requireProductionTemplate} from '../../src/templates/registry.mjs';

const projectRootFromModule = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const now = () => new Date().toISOString();
const clone = (value) => JSON.parse(JSON.stringify(value));

export const DEFAULT_SKILL_JOBS_ROOT = path.join(projectRootFromModule, 'temp', 'skill-jobs');

/**
 * Explicit, minimal input set for the Skill job execution contract fingerprint.
 * This list contains the entry point, execution contract, and direct lifecycle
 * dependencies only; it deliberately excludes job state and generated output.
 */
export const CANONICAL_BUILD_FINGERPRINT_FILES = Object.freeze([
  'docs/architecture/skill-production-contract.md',
  'package.json',
  'scripts/maintenance/bootstrap-runtime.mjs',
  'scripts/maintenance/doctor.mjs',
  'scripts/cli/preview-job.mjs',
  'scripts/cli/render-job.mjs',
  'scripts/cli/finalize-job.mjs',
  'scripts/cli/skill-job.mjs',
  'scripts/lib/background-system.mjs',
  'scripts/lib/dialogue-parser.mjs',
  'scripts/lib/preview-frame.mjs',
  'scripts/lib/skill-job-lifecycle.mjs',
  'scripts/lib/skill-orchestration.mjs',
  'scripts/lib/template-timing.mjs',
  'scripts/lib/timeline-compiler.mjs',
  'scripts/lib/timeline-segmenter.mjs',
  'scripts/lib/workflow-state.mjs',
  'src/templates/registry.mjs',
]);

const CANONICAL_BUILD_IDENTIFIER_PREFIX = 'sha256:';
const CANONICAL_BUILD_IDENTIFIER_DOMAIN = 'eian-paper-ui-broll/canonical-skill-build/v1\0';

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

export const atomicWriteJson = (filePath, value) => {
  const target = path.resolve(filePath);
  const directory = path.dirname(target);
  fs.mkdirSync(directory, {recursive: true});
  const tempPath = path.join(directory, `.${path.basename(target)}.${process.pid}.${crypto.randomUUID()}.tmp`);
  try {
    fs.writeFileSync(tempPath, JSON.stringify(value, null, 2) + '\n');
    fs.renameSync(tempPath, target);
  } finally {
    fs.rmSync(tempPath, {force: true});
  }
};

const atomicWriteText = (filePath, text) => {
  const target = path.resolve(filePath);
  const directory = path.dirname(target);
  fs.mkdirSync(directory, {recursive: true});
  const tempPath = path.join(directory, `.${path.basename(target)}.${process.pid}.${crypto.randomUUID()}.tmp`);
  try {
    fs.writeFileSync(tempPath, text);
    fs.renameSync(tempPath, target);
  } finally {
    fs.rmSync(tempPath, {force: true});
  }
};

const assertFilesystemSafeJobId = (jobId) => {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(String(jobId ?? ''))) {
    throw new Error(`Skill job id must be filesystem safe: ${String(jobId ?? '')}`);
  }
};

const pathsFor = (jobDirectory) => ({
  jobDirectory,
  statePath: path.join(jobDirectory, 'skill-job.json'),
  manifestPath: path.join(jobDirectory, 'manifest.json'),
  parsedDialoguePath: path.join(jobDirectory, 'parsed-dialogue.json'),
  workflowStatePath: path.join(jobDirectory, 'workflow-state.json'),
  timelinePath: path.join(jobDirectory, 'timeline.json'),
  internalSegmentsPath: path.join(jobDirectory, 'segments.json'),
  logsDir: path.join(jobDirectory, 'logs'),
});

const errorSummary = (error) => String(error?.message ?? error ?? 'Unknown Skill job failure').split('\n')[0];

const withPersistence = (skillJob, paths) => ({
  ...skillJob,
  persistence: {
    jobDirectory: paths.jobDirectory,
    statePath: paths.statePath,
    manifestPath: paths.manifestPath,
    parsedDialoguePath: paths.parsedDialoguePath,
  },
  workflow: {
    ...skillJob.workflow,
    stateReference: paths.workflowStatePath,
    timelineReference: paths.timelinePath,
    internalSegmentsReference: paths.internalSegmentsPath,
  },
});

export const writePersistedSkillJob = (statePath, skillJob) => {
  const next = clone(skillJob);
  next.createdAt = next.createdAt ?? now();
  next.updatedAt = now();
  atomicWriteJson(statePath, next);
  return next;
};

export const readPersistedSkillJob = (statePath) => {
  const skillJob = readJson(statePath);
  assertFilesystemSafeJobId(skillJob.jobId);
  return skillJob;
};

export const resumePersistedSkillJob = (statePath) => resumeSkillJob(readPersistedSkillJob(statePath));

const canonicalFingerprintFile = (projectRoot, relativePath) => {
  if (typeof relativePath !== 'string' || !relativePath.trim() || path.isAbsolute(relativePath)) {
    throw new Error(`Canonical build fingerprint paths must be non-empty relative paths: ${String(relativePath ?? '')}`);
  }
  const root = path.resolve(projectRoot);
  const absolutePath = path.resolve(root, relativePath);
  const resolvedRelativePath = path.relative(root, absolutePath);
  if (!resolvedRelativePath || resolvedRelativePath === '..' || resolvedRelativePath.startsWith(`..${path.sep}`) || path.isAbsolute(resolvedRelativePath)) {
    throw new Error(`Canonical build fingerprint path must remain within project root: ${relativePath}`);
  }
  return {
    absolutePath,
    relativePath: resolvedRelativePath.split(path.sep).join('/'),
  };
};

/**
 * Returns a deterministic fingerprint of the explicit current Skill execution
 * contract. It never reads generated job state, runtime output, or baseline ZIP
 * bytes, so the identifier describes the current source build rather than a
 * recovery ancestor or an individual job's mutable state.
 */
export const computeCanonicalBuildIdentifier = ({
  projectRoot = projectRootFromModule,
  files = CANONICAL_BUILD_FINGERPRINT_FILES,
} = {}) => {
  if (!Array.isArray(files) || !files.length) {
    throw new Error('Canonical build fingerprint requires at least one source file.');
  }
  const canonicalFiles = files.map((relativePath) => canonicalFingerprintFile(projectRoot, relativePath));
  canonicalFiles.sort((left, right) => left.relativePath < right.relativePath ? -1 : left.relativePath > right.relativePath ? 1 : 0);
  if (new Set(canonicalFiles.map((file) => file.relativePath)).size !== canonicalFiles.length) {
    throw new Error('Canonical build fingerprint file list must not contain duplicate paths.');
  }

  const fingerprint = crypto.createHash('sha256');
  fingerprint.update(CANONICAL_BUILD_IDENTIFIER_DOMAIN, 'utf8');
  for (const file of canonicalFiles) {
    const contentHash = crypto.createHash('sha256').update(fs.readFileSync(file.absolutePath)).digest('hex');
    fingerprint.update(JSON.stringify({path: file.relativePath, sha256: contentHash}) + '\n', 'utf8');
  }
  return `${CANONICAL_BUILD_IDENTIFIER_PREFIX}${fingerprint.digest('hex')}`;
};

export const resolveCanonicalBuildIdentifier = (projectRoot = projectRootFromModule) => computeCanonicalBuildIdentifier({projectRoot});

/** The immutable recovery lineage is intentionally separate from the current source fingerprint. */
export const resolveSourceBaseline = (projectRoot = projectRootFromModule) => {
  const manifestPath = path.join(projectRoot, 'docs/project/canonical-project-manifest.md');
  const text = fs.readFileSync(manifestPath, 'utf8');
  const matches = [...text.matchAll(/`(baseline\/[^`]+\.zip)`/g)].map((match) => match[1]);
  const sourceBaseline = matches.at(-1);
  if (!sourceBaseline) throw new Error('Canonical manifest does not contain a source baseline reference.');
  return sourceBaseline;
};

const resolveSkillVersion = (projectRoot) => {
  const packageJson = readJson(path.join(projectRoot, 'package.json'));
  if (!packageJson.version) throw new Error('package.json version is required for Skill delivery manifest planning.');
  return packageJson.version;
};

const normaliseSkillPreview = (preview = {}) => ({
  revision: Number(preview.revision ?? 0),
  status: preview.status ?? 'not_generated',
  artifact: preview.artifact ?? preview.artifactReference ?? null,
  representativeFrame: preview.representativeFrame ?? null,
  generatedAt: preview.generatedAt ?? null,
  approvedAt: preview.approvedAt ?? null,
  rejectedAt: preview.rejectedAt ?? null,
  rejectionSummary: preview.rejectionSummary ?? null,
  approvalValid: Boolean(preview.approvalValid),
  failureSummary: preview.failureSummary ?? null,
  manifestSyncPending: Boolean(preview.manifestSyncPending),
  finalParameterConfirmationPending: Boolean(preview.finalParameterConfirmationPending),
  parts: preview.parts && typeof preview.parts === 'object' ? clone(preview.parts) : {},
  history: Array.isArray(preview.history) ? clone(preview.history) : [],
});

const previewHistoryEntry = (preview) => ({
  revision: preview.revision,
  status: preview.status,
  artifact: preview.artifact,
  representativeFrame: preview.representativeFrame,
  generatedAt: preview.generatedAt,
  approvedAt: preview.approvedAt,
  rejectedAt: preview.rejectedAt,
  rejectionSummary: preview.rejectionSummary,
});

const updatePreviewHistory = (preview) => {
  const next = normaliseSkillPreview(preview);
  next.history = [...next.history.filter((entry) => entry.revision !== next.revision), previewHistoryEntry(next)];
  return next;
};

const resolvePersistedPaths = (skillJob, statePath) => ({
  statePath: skillJob.persistence?.statePath ?? path.resolve(statePath),
  manifestPath: skillJob.persistence?.manifestPath ?? path.join(path.dirname(path.resolve(statePath)), 'manifest.json'),
  workflowStatePath: skillJob.workflow?.stateReference ?? path.join(path.dirname(path.resolve(statePath)), 'workflow-state.json'),
  timelinePath: skillJob.workflow?.timelineReference ?? path.join(path.dirname(path.resolve(statePath)), 'timeline.json'),
  jobDirectory: skillJob.persistence?.jobDirectory ?? path.dirname(path.resolve(statePath)),
});

const buildAndWriteDeliveryManifest = (skillJob, projectRoot, manifestPath) => {
  const deliveryManifest = buildDeliveryManifest({
    skillJob,
    skillVersion: resolveSkillVersion(projectRoot),
    canonicalBuildIdentifier: resolveCanonicalBuildIdentifier(projectRoot),
    sourceBaseline: resolveSourceBaseline(projectRoot),
  });
  atomicWriteJson(manifestPath, deliveryManifest);
  return deliveryManifest;
};

const persistSkillPreviewEvent = ({skillJob, statePath, projectRoot}) => {
  const paths = resolvePersistedPaths(skillJob, statePath);
  const persisted = writePersistedSkillJob(paths.statePath, skillJob);
  try {
    buildAndWriteDeliveryManifest(persisted, projectRoot, paths.manifestPath);
    return persisted;
  } catch (error) {
    const safePreview = normaliseSkillPreview(persisted.preview);
    safePreview.approvalValid = false;
    safePreview.status = safePreview.status === 'approved' ? 'ready' : safePreview.status;
    safePreview.manifestSyncPending = true;
    safePreview.failureSummary = `Manifest update failed: ${errorSummary(error)}`;
    const safeJob = {
      ...persisted,
      status: persisted.status === 'readyForRender' ? 'previewReady' : persisted.status,
      preview: updatePreviewHistory(safePreview),
    };
    writePersistedSkillJob(paths.statePath, safeJob);
    throw annotateFailure(error, safeJob, paths.statePath);
  }
};

const conciseProcessSummary = (result, fallback) => {
  const output = [result?.stdout ?? '', result?.stderr ?? ''].join(String.fromCharCode(10));
  const lines = output.split(String.fromCharCode(10)).map((line) => line.trim()).filter(Boolean);
  return lines.find((line) => /^FAIL\b|\berror\b/i.test(line)) ?? lines.at(-1) ?? fallback;
};

/** Inspection-only environment check; dependency installation is handled by the first-use consent gate. */
export const runSkillEnvironmentDoctor = ({projectRoot = projectRootFromModule} = {}) => {
  const result = spawnSync(process.execPath, ['scripts/maintenance/doctor.mjs'], {cwd: projectRoot, encoding: 'utf8'});
  return {
    ok: result.status === 0,
    summary: conciseProcessSummary(result, result.status === 0 ? 'Environment ready.' : 'Environment doctor failed.'),
  };
};

/**
 * Runs the read-only doctor before Preview or Formal Render. It never installs;
 * the Skill entrypoint handles missing dependencies before a job is created.
 */
export const runSkillPreviewDoctor = ({
  projectRoot = projectRootFromModule,
  environmentDoctorRunner = runSkillEnvironmentDoctor,
} = {}) => environmentDoctorRunner({projectRoot});

/** Thin runner around the existing canonical static Remotion Preview command. */
export const runSkillPreviewRenderer = ({projectRoot = projectRootFromModule, workflowStatePath, outputPath}) => {
  execFileSync(process.execPath, [
    'scripts/cli/preview-job.mjs', '--state', workflowStatePath, '--engine', 'remotion', '--output', outputPath,
  ], {cwd: projectRoot, stdio: 'pipe'});
};

const workflowLocksFor = (workflowState) => ({
  contentLocked: Boolean(workflowState.locks?.contentLocked),
  backgroundLocked: Boolean(workflowState.locks?.backgroundLocked),
  templateLocked: Boolean(workflowState.locks?.templateLocked),
  workflowStateReference: null,
});

const persistParsedDialogue = (filePath, normalizedInput) => {
  atomicWriteJson(filePath, {
    schemaVersion: '1.0',
    inputType: normalizedInput.type,
    inputHash: normalizedInput.inputHash,
    messages: normalizedInput.messages,
  });
};

/**
 * Thin import adapter for the existing prepare lifecycle. It calls the existing
 * parser-normalized messages, Timeline compiler, segmenter, workflow state, and
 * template timing functions without copying their behavior or invoking a renderer.
 */
const prepareExistingWorkflow = ({
  skillJob,
  messages,
  selection,
  paths,
  taskText,
}) => {
  const timeline = compileTimeline(messages, {
    ratio: selection.ratio,
    taskText: taskText ?? 'Explore eian-paper-ui-broll',
  });
  const internalSegmentManifest = segmentTimeline(timeline);
  atomicWriteJson(paths.timelinePath, timeline);
  atomicWriteJson(paths.internalSegmentsPath, internalSegmentManifest);
  fs.mkdirSync(paths.logsDir, {recursive: true});

  let workflowState = makeWorkflowState({
    jobId: skillJob.jobId,
    dialoguePath: paths.parsedDialoguePath,
    timelinePath: paths.timelinePath,
    segmentsPath: paths.internalSegmentsPath,
    ratio: selection.ratio,
    outputBaseName: 'final',
    outputDir: paths.jobDirectory,
    manifest: internalSegmentManifest,
  });
  workflowState.assets.logsDir = paths.logsDir;
  workflowState.assets.draftVisualConfigPath = path.join(paths.jobDirectory, 'draft-visual-config.json');
  workflowState.assets.backgroundRenderStatePath = path.join(paths.jobDirectory, 'background-render-state.json');
  workflowState.assets.previewStatePath = path.join(paths.jobDirectory, 'preview-state.json');
  workflowState.assets.visualLockStatePath = path.join(paths.jobDirectory, 'visual-lock-state.json');
  workflowState.assets.renderManifestPath = path.join(paths.jobDirectory, 'render-manifest.json');

  workflowState = selectTemplate(workflowState, selection.templateId);
  workflowState = applyTemplateTimingToState(workflowState, selection.templateId);
  workflowState = selectBackground(workflowState, selection.background.selection);
  writeWorkflowState(paths.workflowStatePath, workflowState);

  return {
    workflowState,
    timeline: readJson(paths.timelinePath),
    internalSegmentManifest: readJson(paths.internalSegmentsPath),
  };
};

const annotateFailure = (error, skillJob, statePath) => {
  const failure = error instanceof Error ? error : new Error(String(error));
  failure.skillJobId = skillJob.jobId;
  failure.skillJobStatePath = statePath;
  return failure;
};

/**
 * Creates a persisted Skill job and takes it through the existing prepare,
 * selection, timeline, and segmentation lifecycle until it is ready for Preview.
 * Preview generation and Formal Render are intentionally outside this task.
 */
export const createAndPrepareSkillJob = ({
  input,
  selection,
  jobsRoot = DEFAULT_SKILL_JOBS_ROOT,
  projectRoot = projectRootFromModule,
  taskText = null,
  idFactory = createSkillJobId,
}) => {
  const jobId = idFactory();
  assertFilesystemSafeJobId(jobId);
  const resolvedJobsRoot = path.resolve(jobsRoot);
  const jobDirectory = path.join(resolvedJobsRoot, jobId);
  const paths = pathsFor(jobDirectory);
  fs.mkdirSync(resolvedJobsRoot, {recursive: true});
  fs.mkdirSync(jobDirectory, {recursive: false});

  let skillJob = withPersistence(createSkillJob({
    inputType: input?.type ?? 'unknown',
    originalInputReference: input?.originalInputReference ?? null,
    parsedDialogueReference: paths.parsedDialoguePath,
    workflowStateReference: paths.workflowStatePath,
    outputRoot: resolvedJobsRoot,
    idFactory: () => jobId,
  }), paths);
  skillJob.status = 'preparing';
  skillJob = writePersistedSkillJob(paths.statePath, skillJob);

  try {
    const normalizedInput = normalizeSkillInput({type: input?.type, value: input?.value});
    persistParsedDialogue(paths.parsedDialoguePath, normalizedInput);
    skillJob.input = {
      ...skillJob.input,
      dialogueInputType: normalizedInput.type,
      normalizedInput: {format: 'messages-v1', messages: clone(normalizedInput.messages)},
      inputHash: normalizedInput.inputHash,
      parsedDialogueReference: paths.parsedDialoguePath,
    };

    const validatedSelection = validateSkillSelection(selection ?? {});
    skillJob = attachSkillSelection(skillJob, validatedSelection);
    skillJob.status = 'preparing';
    skillJob = writePersistedSkillJob(paths.statePath, skillJob);

    const prepared = prepareExistingWorkflow({
      skillJob,
      messages: normalizedInput.messages,
      selection: validatedSelection,
      paths,
      taskText,
    });
    const userVisiblePlan = planUserVisibleParts({
      timeline: prepared.timeline,
      segmentManifest: prepared.internalSegmentManifest,
    });
    const workflowWithUserVisibleParts = attachUserVisibleParts(prepared.workflowState, userVisiblePlan.parts);
    writeWorkflowState(paths.workflowStatePath, workflowWithUserVisibleParts);
    skillJob = attachUserVisiblePlan(skillJob, userVisiblePlan);
    skillJob.selection.background = {
      ...skillJob.selection.background,
      resolvedReference: null,
      workflowStateReference: paths.workflowStatePath,
    };
    skillJob.workflow = {
      ...skillJob.workflow,
      stateReference: paths.workflowStatePath,
      timelineReference: paths.timelinePath,
      internalSegmentsReference: paths.internalSegmentsPath,
    };
    skillJob.locks = {
      ...skillJob.locks,
      workflowStateReference: paths.workflowStatePath,
    };
    skillJob.status = 'readyForPreview';
    skillJob.render.overallStatus = 'not_started';
    skillJob = writePersistedSkillJob(paths.statePath, skillJob);

    buildAndWriteDeliveryManifest(skillJob, projectRoot, paths.manifestPath);
    return skillJob;
  } catch (error) {
    skillJob.status = 'failed';
    skillJob.failure = {
      at: now(),
      summary: errorSummary(error),
    };
    skillJob.render = skillJob.render ?? {};
    skillJob.render.overallStatus = 'failed';
    skillJob = writePersistedSkillJob(paths.statePath, skillJob);
    throw annotateFailure(error, skillJob, paths.statePath);
  }
};

const updateSkillLocksFromWorkflow = (skillJob, workflowState) => ({
  ...skillJob.locks,
  ...workflowLocksFor(workflowState),
  workflowStateReference: skillJob.workflow?.stateReference ?? skillJob.locks?.workflowStateReference ?? null,
});

const previewFailure = (skillJob, summary) => ({
  ...skillJob,
  status: 'readyForPreview',
  preview: updatePreviewHistory({
    ...normaliseSkillPreview(skillJob.preview),
    status: 'failed',
    approvalValid: false,
    failureSummary: summary,
  }),
});

/**
 * Runs the existing doctor then the existing static Remotion Preview command for
 * one whole job. It intentionally never invokes the formal render command.
 */
export const generateSkillJobPreview = ({
  statePath,
  projectRoot = projectRootFromModule,
  doctorRunner = runSkillPreviewDoctor,
  previewRunner = runSkillPreviewRenderer,
}) => {
  let skillJob = readPersistedSkillJob(statePath);
  const paths = resolvePersistedPaths(skillJob, statePath);
  skillJob.preview = normaliseSkillPreview(skillJob.preview);
  if (skillJob.status !== 'readyForPreview') {
    throw new Error(`Skill job ${skillJob.jobId} must be readyForPreview before a new Preview can be generated.`);
  }

  let doctor;
  try {
    doctor = doctorRunner({projectRoot, skillJob, workflowStatePath: paths.workflowStatePath});
  } catch (error) {
    doctor = {ok: false, summary: errorSummary(error)};
  }
  skillJob.doctor = {
    status: doctor?.ok ? 'passed' : 'failed',
    checkedAt: now(),
    summary: String(doctor?.summary ?? (doctor?.ok ? 'Environment ready.' : 'Environment doctor failed.')),
  };
  if (!doctor?.ok) {
    skillJob = previewFailure(skillJob, skillJob.doctor.summary);
    return persistSkillPreviewEvent({skillJob, statePath: paths.statePath, projectRoot});
  }

  const revision = skillJob.preview.revision + 1;
  const outputPath = path.join(paths.jobDirectory, `preview-r${String(revision).padStart(2, '0')}.png`);
  const timeline = readJson(paths.timelinePath);
  const representativeFrame = chooseRepresentativeFrame(timeline);
  skillJob.preview = {
    ...skillJob.preview,
    status: 'generating',
    approvalValid: false,
    failureSummary: null,
  };
  skillJob = persistSkillPreviewEvent({skillJob, statePath: paths.statePath, projectRoot});

  try {
    previewRunner({
      projectRoot,
      workflowStatePath: paths.workflowStatePath,
      outputPath,
      representativeFrame,
      part: null,
    });
    if (!fs.existsSync(outputPath) || path.extname(outputPath).toLowerCase() !== '.png') {
      throw new Error('Existing Preview command did not produce the requested static PNG artifact.');
    }
    const workflowState = readWorkflowState(paths.workflowStatePath);
    if (workflowState.preview?.global?.status !== 'ready' || path.resolve(workflowState.preview.global.path) !== path.resolve(outputPath)) {
      throw new Error('Existing workflow Preview state was not synchronized with the generated artifact.');
    }
    const backgroundState = workflowState.visual?.backgroundRenderState;
    skillJob.selection.background = {
      ...skillJob.selection.background,
      resolved: backgroundState ? {
        id: backgroundState.id,
        backgroundId: backgroundState.backgroundId,
        sourceVisualRevision: backgroundState.sourceVisualRevision,
        sourceBackgroundRevision: backgroundState.sourceBackgroundRevision,
      } : null,
    };
    skillJob.preview = updatePreviewHistory({
      ...normaliseSkillPreview(skillJob.preview),
      revision,
      status: 'ready',
      artifact: outputPath,
      representativeFrame,
      generatedAt: now(),
      approvedAt: null,
      rejectedAt: null,
      rejectionSummary: null,
      approvalValid: false,
      failureSummary: null,
      manifestSyncPending: false,
      finalParameterConfirmationPending: false,
    });
    skillJob.status = 'previewReady';
    skillJob.locks = updateSkillLocksFromWorkflow(skillJob, workflowState);
    return persistSkillPreviewEvent({skillJob, statePath: paths.statePath, projectRoot});
  } catch (error) {
    skillJob = previewFailure(skillJob, errorSummary(error));
    return persistSkillPreviewEvent({skillJob, statePath: paths.statePath, projectRoot});
  }
};

/** Approves Preview through the existing authoritative workflow Preview Gate. */
export const approveSkillJobPreview = ({statePath, projectRoot = projectRootFromModule}) => {
  let skillJob = readPersistedSkillJob(statePath);
  const paths = resolvePersistedPaths(skillJob, statePath);
  skillJob.preview = normaliseSkillPreview(skillJob.preview);
  if (skillJob.status !== 'previewReady' || skillJob.preview.status !== 'ready') {
    throw new Error(`Skill job ${skillJob.jobId} must have a ready Preview before approval.`);
  }
  let workflowState = readWorkflowState(paths.workflowStatePath);
  const alreadyApproved = workflowState.preview?.global?.status === 'approved' &&
    workflowState.locks?.contentLocked && workflowState.locks?.backgroundLocked;
  if (!alreadyApproved) {
    workflowState = approveWorkflowPreview(workflowState);
    workflowState = writeWorkflowState(paths.workflowStatePath, workflowState);
  }
  skillJob.preview = updatePreviewHistory({
    ...skillJob.preview,
    status: 'approved',
    approvedAt: workflowState.preview.global.approvedAt,
    approvalValid: true,
    failureSummary: null,
    finalParameterConfirmationPending: true,
  });
  skillJob.locks = updateSkillLocksFromWorkflow(skillJob, workflowState);
  skillJob.status = 'readyForRender';
  return persistSkillPreviewEvent({skillJob, statePath: paths.statePath, projectRoot});
};

/** Rejection is Skill metadata only; existing workflow approval is deliberately never fabricated. */
export const rejectSkillJobPreview = ({statePath, reason, projectRoot = projectRootFromModule}) => {
  let skillJob = readPersistedSkillJob(statePath);
  const paths = resolvePersistedPaths(skillJob, statePath);
  skillJob.preview = normaliseSkillPreview(skillJob.preview);
  if (skillJob.status !== 'previewReady' || skillJob.preview.status !== 'ready') {
    throw new Error(`Skill job ${skillJob.jobId} must have a ready Preview before rejection.`);
  }
  const rejectionSummary = String(reason ?? '').trim();
  if (!rejectionSummary) throw new Error('Preview rejection requires a concise reason.');
  skillJob.preview = updatePreviewHistory({
    ...skillJob.preview,
    status: 'rejected',
    rejectedAt: now(),
    rejectionSummary,
    approvalValid: false,
  });
  skillJob.status = 'readyForPreview';
  return persistSkillPreviewEvent({skillJob, statePath: paths.statePath, projectRoot});
};

/**
 * Revokes an approved Preview before a caller applies an explicitly requested
 * template, ratio, background, or input-content change through its existing
 * authoritative mutation path.
 */
export const invalidateSkillJobPreviewApproval = ({statePath, changedFields, projectRoot = projectRootFromModule}) => {
  const permitted = new Set(['template', 'ratio', 'background', 'input']);
  const fields = Array.isArray(changedFields) ? [...new Set(changedFields)] : [];
  if (!fields.length || fields.some((field) => !permitted.has(field))) {
    throw new Error('Preview approval invalidation requires template, ratio, background, or input as the changed field.');
  }
  let skillJob = readPersistedSkillJob(statePath);
  const paths = resolvePersistedPaths(skillJob, statePath);
  skillJob.preview = normaliseSkillPreview(skillJob.preview);
  if (skillJob.status !== 'readyForRender' || !skillJob.preview.approvalValid) {
    throw new Error(`Skill job ${skillJob.jobId} does not have an approval that can be invalidated.`);
  }
  let workflowState = readWorkflowState(paths.workflowStatePath);
  workflowState = invalidateWorkflowPreviewApproval(workflowState, {reason: `skill-${fields.sort().join('-')}-changed`});
  workflowState = writeWorkflowState(paths.workflowStatePath, workflowState);
  skillJob.preview = {
    ...skillJob.preview,
    status: 'stale',
    approvalValid: false,
    approvedAt: null,
    finalParameterConfirmationPending: false,
  };
  skillJob.locks = updateSkillLocksFromWorkflow(skillJob, workflowState);
  skillJob.status = 'readyForPreview';
  return persistSkillPreviewEvent({skillJob, statePath: paths.statePath, projectRoot});
};

/** Resolution-only changes preserve Preview approval but require final-parameter confirmation later. */
export const noteSkillJobFinalResolutionChange = ({statePath, resolution, projectRoot = projectRootFromModule}) => {
  if (!['720p', '1080p'].includes(resolution)) throw new Error(`Unsupported final resolution: ${String(resolution ?? '')}`);
  let skillJob = readPersistedSkillJob(statePath);
  const paths = resolvePersistedPaths(skillJob, statePath);
  skillJob.preview = normaliseSkillPreview(skillJob.preview);
  if (skillJob.status !== 'readyForRender' || !skillJob.preview.approvalValid) {
    throw new Error(`Skill job ${skillJob.jobId} requires an approved Preview before its final resolution can change.`);
  }
  skillJob.selection = {...skillJob.selection, resolution};
  skillJob.preview = {...skillJob.preview, finalParameterConfirmationPending: true};
  return persistSkillPreviewEvent({skillJob, statePath: paths.statePath, projectRoot});
};


const appendRenderHistory = (skillJob, type, data = {}) => ({
  ...skillJob,
  render: {
    ...skillJob.render,
    history: [...(skillJob.render?.history ?? []), {at:now(), type, ...data}],
  },
});

const defaultFormalManifestWriter = ({skillJob, projectRoot, manifestPath}) => (
  buildAndWriteDeliveryManifest(skillJob, projectRoot, manifestPath)
);

/** Persists skill state first, then atomically synchronizes the delivery manifest. */
const persistFormalEvent = ({skillJob, statePath, projectRoot, manifestWriter = defaultFormalManifestWriter}) => {
  const paths = resolvePersistedPaths(skillJob, statePath);
  const persisted = writePersistedSkillJob(paths.statePath, skillJob);
  try {
    manifestWriter({skillJob:persisted, projectRoot, manifestPath:paths.manifestPath});
    return {skillJob:persisted, manifestSynced:true};
  } catch (error) {
    const safeJob = {
      ...persisted,
      status:'manifestSyncPending',
      render:{
        ...persisted.render,
        overallStatus:'manifest_sync_pending',
        manifestSyncPending:true,
        manifestSyncFailure:errorSummary(error),
      },
    };
    writePersistedSkillJob(paths.statePath, safeJob);
    return {skillJob:safeJob, manifestSynced:false, error};
  }
};

const formalOutputPathFor = (skillJob, part) => path.join(skillJob.delivery.outputDirectory, part.filename);

const assertFormalRenderPreconditions = (skillJob, workflowState) => {
  if (!['readyForRender', 'awaitingNextPart'].includes(skillJob.status)) {
    throw new Error(`Skill job ${skillJob.jobId} must be readyForRender before Formal Render.`);
  }
  if (!skillJob.preview?.approvalValid || skillJob.preview?.status !== 'approved') {
    throw new Error('Formal Render requires an approved, valid global Preview.');
  }
  if (skillJob.preview?.finalParameterConfirmationPending) {
    throw new Error('Formal Render requires confirmed final parameters.');
  }
  if (!skillJob.finalParameters?.confirmedAt) throw new Error('Formal Render requires explicit final parameter confirmation.');
  if (!skillJob.locks?.contentLocked || !skillJob.locks?.backgroundLocked || !workflowState.locks?.contentLocked || !workflowState.locks?.backgroundLocked) {
    throw new Error('Formal Render requires synchronized content and background locks.');
  }
  if (workflowState.preview?.global?.status !== 'approved') throw new Error('Formal Render requires the existing workflow Preview Gate approval.');
  requireProductionTemplate(skillJob.selection.templateId, skillJob.selection.ratio);
  fs.mkdirSync(skillJob.delivery.outputDirectory, {recursive:true});
  fs.accessSync(skillJob.delivery.outputDirectory, fs.constants.W_OK);
  fs.accessSync(path.dirname(skillJob.persistence.manifestPath), fs.constants.W_OK);
};

/** Formal renderer adapter: the canonical renderer retains all template and codec behavior. */
export const runSkillFormalRenderer = ({
  projectRoot = projectRootFromModule,
  workflowStatePath,
  outputPath,
  userVisiblePart,
  dimensions,
}) => {
  execFileSync(process.execPath, [
    'scripts/cli/render-job.mjs', '--state', workflowStatePath, '--engine', 'remotion',
    '--user-visible-part', String(userVisiblePart), '--output', outputPath,
    '--width', String(dimensions.width), '--height', String(dimensions.height),
  ], {cwd:projectRoot, stdio:'pipe'});
};

/** Reuses the canonical finalizer and preserves compact job audit state. */
export const runSkillFormalFinalizer = ({projectRoot = projectRootFromModule, workflowStatePath}) => {
  execFileSync(process.execPath, ['scripts/cli/finalize-job.mjs', '--state', workflowStatePath, '--keep-state'], {cwd:projectRoot, stdio:'pipe'});
  return {cleaned:true};
};

const derivedPostRenderStatus = (skillJob) => {
  if (skillJob.render.parts.some((part) => part.status === 'failed')) return 'failed';
  if (skillJob.render.parts.every((part) => part.status === 'completed')) return 'rendered';
  return 'awaitingNextPart';
};

const setPartState = (skillJob, partIndex, patch) => ({
  ...skillJob,
  render:{
    ...skillJob.render,
    parts: skillJob.render.parts.map((part) => Number(part.index) === Number(partIndex) ? {...part, ...patch} : part),
  },
});

/** Explicitly records the final template, ratio, resolution, background, output mode, and Part count. */
export const confirmSkillJobFinalParameters = ({statePath, projectRoot = projectRootFromModule, manifestWriter = defaultFormalManifestWriter}) => {
  let skillJob = readPersistedSkillJob(statePath);
  const paths = resolvePersistedPaths(skillJob, statePath);
  skillJob.preview = normaliseSkillPreview(skillJob.preview);
  if (skillJob.status !== 'readyForRender' || !skillJob.preview.approvalValid || skillJob.preview.status !== 'approved') {
    throw new Error(`Skill job ${skillJob.jobId} requires an approved Preview before final parameters can be confirmed.`);
  }
  const dimensions = finalDimensionsFor(skillJob.selection.ratio, skillJob.selection.resolution);
  skillJob.finalParameters = {
    templateId:skillJob.selection.templateId,
    ratio:skillJob.selection.ratio,
    resolution:skillJob.selection.resolution,
    dimensions,
    background:skillJob.selection.background.selection,
    outputMode:skillJob.durationPlan.outputMode,
    partCount:skillJob.durationPlan.userVisibleParts.length,
    confirmedAt:now(),
  };
  skillJob.preview = {...skillJob.preview, finalParameterConfirmationPending:false};
  skillJob = appendRenderHistory(skillJob, 'final-parameters-confirmed', {resolution:skillJob.selection.resolution, dimensions});
  return persistFormalEvent({skillJob, statePath:paths.statePath, projectRoot, manifestWriter}).skillJob;
};

/** The only post-lock template exception: user-visible Part 2 of an exactly-two-Part delivery. */
export const prepareSkillJobTwoPartTemplateException = ({statePath, templateId, projectRoot = projectRootFromModule, manifestWriter = defaultFormalManifestWriter}) => {
  let skillJob = readPersistedSkillJob(statePath);
  const paths = resolvePersistedPaths(skillJob, statePath);
  if (skillJob.durationPlan?.userVisibleParts?.length !== 2) throw new Error('The template-change exception is limited to exactly two user-visible Parts.');
  if (skillJob.status !== 'awaitingNextPart' || skillJob.render.parts[0]?.status !== 'completed' || skillJob.render.parts[1]?.status !== 'pending') {
    throw new Error('The user-visible Part 2 template-change exception requires a completed Part 1 and an unstarted Part 2.');
  }
  requireProductionTemplate(templateId, skillJob.selection.ratio);
  let workflowState = readWorkflowState(paths.workflowStatePath);
  workflowState = selectTemplate(workflowState, templateId, {userVisiblePart:2});
  workflowState = writeWorkflowState(paths.workflowStatePath, workflowState);
  skillJob.locks = {
    ...updateSkillLocksFromWorkflow(skillJob, workflowState),
    twoPartException:{
      eligible:true,
      used:true,
      previousTemplateId:skillJob.selection.templateId,
      replacementTemplateId:templateId,
      userVisiblePart:2,
    },
  };
  skillJob = setPartState(skillJob, 2, {templateId});
  skillJob.preview = normaliseSkillPreview(skillJob.preview);
  skillJob.preview.parts = {
    ...skillJob.preview.parts,
    '2':{revision:0, status:'not_generated', artifact:null, generatedAt:null, approvedAt:null, approvalValid:false, templateId, failureSummary:null},
  };
  skillJob.preview.finalParameterConfirmationPending = true;
  skillJob.status = 'awaitingPart2ExceptionPreview';
  skillJob = appendRenderHistory(skillJob, 'two-part-exception-requested', {part:2, templateId});
  return persistFormalEvent({skillJob, statePath:paths.statePath, projectRoot, manifestWriter}).skillJob;
};

/** Generates the one allowed user-visible Part 2 Preview with the existing Preview command. */
export const generateSkillJobUserVisiblePartPreview = ({
  statePath,
  userVisiblePart = 2,
  projectRoot = projectRootFromModule,
  doctorRunner = runSkillPreviewDoctor,
  previewRunner = ({projectRoot:root, workflowStatePath, outputPath, userVisiblePart:part}) => execFileSync(process.execPath, [
    'scripts/cli/preview-job.mjs', '--state', workflowStatePath, '--engine', 'remotion', '--user-visible-part', String(part), '--output', outputPath,
  ], {cwd:root, stdio:'pipe'}),
  manifestWriter = defaultFormalManifestWriter,
}) => {
  if (Number(userVisiblePart) !== 2) throw new Error('Only user-visible Part 2 supports the approved template-change exception.');
  let skillJob = readPersistedSkillJob(statePath);
  const paths = resolvePersistedPaths(skillJob, statePath);
  skillJob.preview = normaliseSkillPreview(skillJob.preview);
  if (skillJob.status !== 'awaitingPart2ExceptionPreview') throw new Error('User-visible Part 2 exception Preview is not currently required.');
  const doctor = doctorRunner({projectRoot, skillJob, workflowStatePath:paths.workflowStatePath});
  skillJob.doctor = {status:doctor?.ok ? 'passed' : 'failed', checkedAt:now(), summary:String(doctor?.summary ?? 'Environment doctor failed.')};
  if (!doctor?.ok) {
    skillJob.preview.parts['2'] = {...skillJob.preview.parts['2'], status:'failed', failureSummary:skillJob.doctor.summary, approvalValid:false};
    return persistFormalEvent({skillJob, statePath:paths.statePath, projectRoot, manifestWriter}).skillJob;
  }
  const current = skillJob.preview.parts['2'] ?? {};
  const revision = Number(current.revision ?? 0) + 1;
  const outputPath = path.join(paths.jobDirectory, `part-02-exception-preview-r${String(revision).padStart(2, '0')}.png`);
  previewRunner({projectRoot, workflowStatePath:paths.workflowStatePath, outputPath, userVisiblePart:2});
  if (!fs.existsSync(outputPath) || path.extname(outputPath).toLowerCase() !== '.png') throw new Error('Existing Preview command did not produce the user-visible Part 2 exception artifact.');
  const workflowState = readWorkflowState(paths.workflowStatePath);
  const preview = workflowState.preview?.userVisibleParts?.['2'];
  if (!preview || preview.status !== 'ready' || path.resolve(preview.path) !== path.resolve(outputPath)) throw new Error('Existing workflow user-visible Part 2 Preview state was not synchronized.');
  skillJob.preview.parts['2'] = {revision, status:'ready', artifact:outputPath, generatedAt:now(), approvedAt:null, approvalValid:false, templateId:current.templateId, failureSummary:null};
  skillJob.status = 'awaitingPart2ExceptionApproval';
  skillJob = appendRenderHistory(skillJob, 'two-part-exception-preview-generated', {part:2, revision, artifact:outputPath});
  return persistFormalEvent({skillJob, statePath:paths.statePath, projectRoot, manifestWriter}).skillJob;
};

export const approveSkillJobUserVisiblePartPreview = ({statePath, userVisiblePart = 2, projectRoot = projectRootFromModule, manifestWriter = defaultFormalManifestWriter}) => {
  if (Number(userVisiblePart) !== 2) throw new Error('Only user-visible Part 2 supports the approved template-change exception.');
  let skillJob = readPersistedSkillJob(statePath);
  const paths = resolvePersistedPaths(skillJob, statePath);
  skillJob.preview = normaliseSkillPreview(skillJob.preview);
  if (skillJob.status !== 'awaitingPart2ExceptionApproval' || skillJob.preview.parts?.['2']?.status !== 'ready') throw new Error('User-visible Part 2 exception Preview must be ready before approval.');
  let workflowState = readWorkflowState(paths.workflowStatePath);
  workflowState = approveWorkflowPreview(workflowState, {userVisiblePart:2});
  workflowState = writeWorkflowState(paths.workflowStatePath, workflowState);
  const approvedAt = workflowState.preview.userVisibleParts['2'].approvedAt;
  skillJob.preview.parts['2'] = {...skillJob.preview.parts['2'], status:'approved', approvedAt, approvalValid:true, failureSummary:null};
  skillJob.locks = updateSkillLocksFromWorkflow(skillJob, workflowState);
  skillJob.status = 'readyForRender';
  skillJob = appendRenderHistory(skillJob, 'two-part-exception-preview-approved', {part:2, templateId:skillJob.render.parts[1]?.templateId});
  return persistFormalEvent({skillJob, statePath:paths.statePath, projectRoot, manifestWriter}).skillJob;
};

const renderSkillJobFormalInternal = ({
  statePath,
  projectRoot = projectRootFromModule,
  doctorRunner = runSkillPreviewDoctor,
  rendererRunner = runSkillFormalRenderer,
  manifestWriter = defaultFormalManifestWriter,
  mode = 'all',
  retrying = false,
}) => {
  if (!['next', 'all'].includes(mode)) throw new Error('Formal Render mode must be next or all.');
  let skillJob = readPersistedSkillJob(statePath);
  const paths = resolvePersistedPaths(skillJob, statePath);
  if (skillJob.render?.manifestSyncPending || skillJob.status === 'manifestSyncPending') return repairSkillJobManifest({statePath:paths.statePath, projectRoot, manifestWriter});
  skillJob.preview = normaliseSkillPreview(skillJob.preview);
  const workflowState = readWorkflowState(paths.workflowStatePath);
  assertFormalRenderPreconditions(skillJob, workflowState);
  const doctor = doctorRunner({projectRoot, skillJob, workflowStatePath:paths.workflowStatePath});
  skillJob.doctor = {status:doctor?.ok ? 'passed' : 'failed', checkedAt:now(), summary:String(doctor?.summary ?? 'Environment doctor failed.')};
  if (!doctor?.ok) {
    skillJob.render = {...skillJob.render, overallStatus:'blocked'};
    skillJob = appendRenderHistory(skillJob, 'formal-render-blocked-by-doctor', {summary:skillJob.doctor.summary});
    return persistFormalEvent({skillJob, statePath:paths.statePath, projectRoot, manifestWriter}).skillJob;
  }
  const first = skillJob.render.parts.find((part) => part.status !== 'completed');
  if (!first) return skillJob;
  if (first.status === 'failed' && !retrying) throw new Error('Formal Render failed previously; use retry to continue from the failed user-visible Part.');
  const partsToRender = mode === 'next' ? [first] : skillJob.render.parts.filter((part) => Number(part.index) >= Number(first.index) && part.status !== 'completed');
  skillJob.status = 'rendering';
  skillJob.render = {...skillJob.render, overallStatus:'rendering', failedPart:null};
  skillJob = appendRenderHistory(skillJob, retrying ? 'formal-render-retry-resumed' : 'formal-render-started', {fromPart:first.index, mode});
  let persisted = persistFormalEvent({skillJob, statePath:paths.statePath, projectRoot, manifestWriter});
  skillJob = persisted.skillJob;
  if (!persisted.manifestSynced) return skillJob;

  for (const candidate of partsToRender) {
    let part = skillJob.render.parts.find((entry) => Number(entry.index) === Number(candidate.index));
    if (part.status === 'completed') continue;
    const prior = skillJob.render.parts.filter((entry) => Number(entry.index) < Number(part.index));
    if (!prior.every((entry) => entry.status === 'completed')) break;
    requireProductionTemplate(part.templateId, skillJob.selection.ratio);
    const outputPath = formalOutputPathFor(skillJob, part);
    skillJob = setPartState(skillJob, part.index, {status:'rendering', startedAt:now(), attempts:Number(part.attempts ?? 0) + 1, errorSummary:null, failedAt:null});
    skillJob = appendRenderHistory(skillJob, 'user-visible-part-render-started', {part:part.index, outputPath, templateId:part.templateId});
    persisted = persistFormalEvent({skillJob, statePath:paths.statePath, projectRoot, manifestWriter});
    skillJob = persisted.skillJob;
    if (!persisted.manifestSynced) return skillJob;
    try {
      rendererRunner({projectRoot, workflowStatePath:paths.workflowStatePath, outputPath, userVisiblePart:part.index, dimensions:finalDimensionsFor(skillJob.selection.ratio, skillJob.selection.resolution), templateId:part.templateId});
      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size <= 0) throw new Error(`Formal renderer did not produce a non-empty output for user-visible Part ${part.index}.`);
      skillJob = setPartState(skillJob, part.index, {status:'completed', completedAt:now(), outputPath, errorSummary:null, failedAt:null});
      skillJob = appendRenderHistory(skillJob, 'user-visible-part-render-completed', {part:part.index, outputPath, templateId:part.templateId});
      persisted = persistFormalEvent({skillJob, statePath:paths.statePath, projectRoot, manifestWriter});
      skillJob = persisted.skillJob;
      if (!persisted.manifestSynced) return skillJob;
    } catch (error) {
      skillJob = setPartState(skillJob, part.index, {status:'failed', failedAt:now(), errorSummary:errorSummary(error)});
      skillJob.status = 'failed';
      skillJob.render = {...skillJob.render, overallStatus:'failed', failedPart:part.index};
      skillJob = appendRenderHistory(skillJob, 'user-visible-part-render-failed', {part:part.index, summary:errorSummary(error)});
      return persistFormalEvent({skillJob, statePath:paths.statePath, projectRoot, manifestWriter}).skillJob;
    }
  }
  const status = derivedPostRenderStatus(skillJob);
  skillJob.status = status;
  skillJob.render = {...skillJob.render, overallStatus:status === 'rendered' ? 'completed' : 'rendering', failedPart:null};
  skillJob = appendRenderHistory(skillJob, status === 'rendered' ? 'all-user-visible-parts-completed' : 'formal-render-awaiting-next-part', {});
  return persistFormalEvent({skillJob, statePath:paths.statePath, projectRoot, manifestWriter}).skillJob;
};

export const renderSkillJobFormal = (options) => renderSkillJobFormalInternal(options);

export const retrySkillJobFormalRender = ({statePath, projectRoot = projectRootFromModule, doctorRunner = runSkillPreviewDoctor, rendererRunner = runSkillFormalRenderer, manifestWriter = defaultFormalManifestWriter, mode = 'all'}) => {
  let skillJob = readPersistedSkillJob(statePath);
  const paths = resolvePersistedPaths(skillJob, statePath);
  if (skillJob.status !== 'failed' || !Number.isInteger(skillJob.render?.failedPart)) throw new Error('Retry requires a failed user-visible Part.');
  const failedPart = skillJob.render.failedPart;
  skillJob = setPartState(skillJob, failedPart, {status:'pending', errorSummary:null, failedAt:null});
  skillJob.status = 'awaitingNextPart';
  skillJob.render = {...skillJob.render, overallStatus:'retrying', retry:{attempt:Number(skillJob.render.retry?.attempt ?? 0) + 1, resumeFromPart:failedPart}, failedPart:null};
  skillJob = appendRenderHistory(skillJob, 'formal-render-retry-started', {fromPart:failedPart, attempt:skillJob.render.retry.attempt});
  const persisted = persistFormalEvent({skillJob, statePath:paths.statePath, projectRoot, manifestWriter});
  if (!persisted.manifestSynced) return persisted.skillJob;
  return renderSkillJobFormalInternal({statePath:paths.statePath, projectRoot, doctorRunner, rendererRunner, manifestWriter, mode, retrying:true});
};

/** Repairs only manifest synchronization. Completed MP4s and Part attempts are never rendered again here. */
export const repairSkillJobManifest = ({statePath, projectRoot = projectRootFromModule, manifestWriter = defaultFormalManifestWriter}) => {
  let skillJob = readPersistedSkillJob(statePath);
  const paths = resolvePersistedPaths(skillJob, statePath);
  if (!skillJob.render?.manifestSyncPending && skillJob.status !== 'manifestSyncPending') throw new Error('Skill job does not have a pending manifest synchronization.');
  const status = derivedPostRenderStatus(skillJob);
  skillJob.status = status;
  skillJob.render = {...skillJob.render, overallStatus:status === 'rendered' ? 'completed' : (status === 'failed' ? 'failed' : 'rendering'), manifestSyncPending:false, manifestSyncFailure:null};
  skillJob = appendRenderHistory(skillJob, 'manifest-synchronization-repaired', {});
  return persistFormalEvent({skillJob, statePath:paths.statePath, projectRoot, manifestWriter}).skillJob;
};

export const finalizeSkillJobFormalRender = ({statePath, projectRoot = projectRootFromModule, finalizerRunner = runSkillFormalFinalizer, manifestWriter = defaultFormalManifestWriter}) => {
  let skillJob = readPersistedSkillJob(statePath);
  const paths = resolvePersistedPaths(skillJob, statePath);
  if (skillJob.render?.manifestSyncPending || skillJob.status === 'manifestSyncPending') return repairSkillJobManifest({statePath:paths.statePath, projectRoot, manifestWriter});
  if (skillJob.status !== 'rendered' || skillJob.render?.overallStatus !== 'completed' || !skillJob.render.parts.every((part) => part.status === 'completed')) {
    throw new Error('Finalization requires every user-visible Part to complete successfully.');
  }
  for (const part of skillJob.render.parts) {
    const outputPath = formalOutputPathFor(skillJob, part);
    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size <= 0) throw new Error(`Finalization refused: output is missing for user-visible Part ${part.index}.`);
  }
  skillJob.status = 'finalizing';
  skillJob = appendRenderHistory(skillJob, 'formal-finalize-started', {});
  let persisted = persistFormalEvent({skillJob, statePath:paths.statePath, projectRoot, manifestWriter});
  skillJob = persisted.skillJob;
  if (!persisted.manifestSynced) return skillJob;
  try {
    finalizerRunner({projectRoot, workflowStatePath:paths.workflowStatePath});
  } catch (error) {
    skillJob.status = 'finalizeFailed';
    skillJob.render = {...skillJob.render, overallStatus:'finalize_failed'};
    skillJob = appendRenderHistory(skillJob, 'formal-finalize-failed', {summary:errorSummary(error)});
    return persistFormalEvent({skillJob, statePath:paths.statePath, projectRoot, manifestWriter}).skillJob;
  }
  skillJob.status = 'completed';
  skillJob.render = {...skillJob.render, overallStatus:'completed', finalizedAt:now()};
  skillJob = appendRenderHistory(skillJob, 'formal-finalize-completed', {});
  return persistFormalEvent({skillJob, statePath:paths.statePath, projectRoot, manifestWriter}).skillJob;
};

export const skillJobSummary = (skillJob) => ({
  jobId: skillJob.jobId,
  status: skillJob.status,
  templateId: skillJob.selection.templateId,
  ratio: skillJob.selection.ratio,
  resolution: skillJob.selection.resolution,
  outputMode: skillJob.durationPlan.outputMode,
  partCount: skillJob.durationPlan.userVisibleParts.length,
  statePath: skillJob.persistence.statePath,
  manifestPath: skillJob.persistence.manifestPath,
  previewStatus: skillJob.preview.status,
  previewRevision: skillJob.preview.revision,
  previewArtifact: skillJob.preview.artifact ?? null,
  previewApprovalValid: Boolean(skillJob.preview.approvalValid),
  finalParameterConfirmationPending: Boolean(skillJob.preview.finalParameterConfirmationPending),
  renderStatus: skillJob.render?.overallStatus ?? 'not_started',
  renderParts: (skillJob.render?.parts ?? []).map((part) => ({
    index:part.index,
    status:part.status,
    filename:part.filename,
    templateId:part.templateId,
    attempts:part.attempts ?? 0,
    outputPath:part.outputPath ?? null,
  })),
});

export const readSkillJobInputFile = (inputPath) => ({
  originalInputReference: path.resolve(inputPath),
  value: fs.readFileSync(inputPath, 'utf8'),
});

export const writeCanonicalLabelledInputForDebug = (filePath, messages) => {
  const content = messages.map((message) => `${message.speaker === 'user' ? 'User' : 'AI'}:\n${message.text}`).join('\n\n') + '\n';
  atomicWriteText(filePath, content);
};
