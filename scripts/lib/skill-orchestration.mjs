import crypto from 'node:crypto';
import path from 'node:path';
import {normalizePlainText, parseDialogue} from './dialogue-parser.mjs';
import {DEFAULT_BACKGROUND} from './workflow-state.mjs';
import {canvasForRatio, previewCanvasForRatio} from './background-system.mjs';
import {requirePreviewTemplate} from '../../src/templates/registry.mjs';

export const SKILL_JOB_SCHEMA_VERSION = '1.0';
export const DELIVERY_MANIFEST_SCHEMA_VERSION = '1.0';
export const DEFAULT_RESOLUTION = '1080p';
export const USER_VISIBLE_PART_MAX_SECONDS = 20;

/** Reuses the existing native and preview canvas mappings for formal output sizes. */
export const finalDimensionsFor = (ratio, resolution) => {
  if (resolution === '1080p') return canvasForRatio(ratio);
  if (resolution === '720p') return previewCanvasForRatio(ratio);
  throw new Error(`Unsupported final resolution: ${String(resolution ?? '')}`);
};

const USER_VISIBLE_PART_MAX_FRAMES = USER_VISIBLE_PART_MAX_SECONDS * 24;
const JOB_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const clone = (value) => JSON.parse(JSON.stringify(value));
const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
const seconds = (frames, fps) => Number((Number(frames) / Number(fps)).toFixed(3));
const now = () => new Date().toISOString();

const structuredRoleToSpeaker = (role) => {
  const normalized = String(role ?? '').trim().toLowerCase();
  if (['user', 'you', '用户'].includes(normalized)) return 'user';
  if (['assistant', 'ai', 'chatgpt', 'gpt', '助手'].includes(normalized)) return 'assistant';
  throw new Error(`Unsupported structured dialogue role: ${String(role ?? '')}`);
};

const assertMessages = (messages) => {
  if (!Array.isArray(messages) || !messages.length) {
    throw new Error('Dialogue input must contain at least one message.');
  }
  if (!messages.some((message) => message.speaker === 'user')) {
    throw new Error('Dialogue must contain at least one user message.');
  }
  if (!messages.some((message) => message.speaker === 'assistant')) {
    throw new Error('Dialogue must contain at least one assistant message.');
  }
};

const normaliseStructuredDialogue = (value) => {
  let input = value;
  if (typeof value === 'string') {
    try {
      input = JSON.parse(value);
    } catch (error) {
      throw new Error(`Invalid structured JSON: ${error.message}`);
    }
  }
  if (!input || typeof input !== 'object' || Array.isArray(input) || !Array.isArray(input.messages)) {
    throw new Error('Structured dialogue input must be an object with a messages array.');
  }

  const messages = input.messages.map((message, index) => {
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      throw new Error(`Structured dialogue message ${index + 1} must be an object.`);
    }
    if (typeof message.content !== 'string') {
      throw new Error(`Structured dialogue message ${index + 1} content must be a string.`);
    }
    const text = normalizePlainText(message.content);
    if (!text) throw new Error(`Structured dialogue message ${index + 1} content must not be empty.`);
    return {
      id: `m${index + 1}`,
      speaker: structuredRoleToSpeaker(message.role),
      name: null,
      text,
    };
  });
  assertMessages(messages);
  return messages;
};

/**
 * Converts supported Skill input into the existing timeline message semantics.
 * It deliberately preserves message cardinality and leaves rendering concerns to
 * the existing Parser, Timeline, and workflow implementations.
 */
export const normalizeSkillInput = ({type, value}) => {
  if (type === 'labelled-text') {
    if (typeof value !== 'string') throw new Error('Labelled dialogue input must be a string.');
    const messages = parseDialogue(value);
    return {
      type,
      messages,
      inputHash: digest(JSON.stringify({type, messages})),
    };
  }
  if (type === 'structured-json') {
    const messages = normaliseStructuredDialogue(value);
    return {
      type,
      messages,
      inputHash: digest(JSON.stringify({type, messages})),
    };
  }
  throw new Error(`Unsupported Skill dialogue input type: ${String(type ?? '')}`);
};

export const createSkillJobId = () => `eian-skill-${crypto.randomUUID()}`;

const assertFilesystemSafeJobId = (jobId) => {
  if (typeof jobId !== 'string' || !JOB_ID_PATTERN.test(jobId)) {
    throw new Error(`Skill job id must be filesystem safe: ${String(jobId ?? '')}`);
  }
};

export const planSkillOutput = ({jobId, outputRoot = 'output', outputMode = null, partCount = 0}) => {
  assertFilesystemSafeJobId(jobId);
  if (!outputRoot || typeof outputRoot !== 'string') throw new Error('Output root is required.');
  const outputDirectory = path.join(outputRoot, jobId);
  const manifestPath = path.join(outputDirectory, 'manifest.json');
  let filenames = [];
  if (outputMode === 'single') filenames = ['final.mp4'];
  if (outputMode === 'multipart') {
    if (!Number.isInteger(partCount) || partCount < 2) throw new Error('Multipart output requires at least two Parts.');
    filenames = Array.from({length: partCount}, (_, index) => `part-${String(index + 1).padStart(2, '0')}.mp4`);
  }
  if (outputMode !== null && !['single', 'multipart'].includes(outputMode)) {
    throw new Error(`Unsupported user-visible output mode: ${outputMode}`);
  }
  return {outputRoot, outputDirectory, manifestPath, filenames};
};

export const createSkillJob = ({
  normalizedInput = null,
  inputType = normalizedInput?.type ?? null,
  originalInputReference = null,
  parsedDialogueReference = null,
  workflowStateReference = null,
  outputRoot = 'output',
  idFactory = createSkillJobId,
}) => {
  if (!inputType) throw new Error('A Skill dialogue input type is required.');
  if (normalizedInput && (!normalizedInput.type || !Array.isArray(normalizedInput.messages) || !normalizedInput.inputHash)) {
    throw new Error('Normalized Skill dialogue input is incomplete.');
  }
  if (normalizedInput) assertMessages(normalizedInput.messages);
  const jobId = idFactory();
  assertFilesystemSafeJobId(jobId);
  const delivery = planSkillOutput({jobId, outputRoot});
  return {
    schemaVersion: SKILL_JOB_SCHEMA_VERSION,
    jobId,
    status: 'draft',
    createdAt: now(),
    updatedAt: now(),
    input: {
      dialogueInputType: inputType,
      originalInputReference,
      normalizedInput: {
        format: 'messages-v1',
        messages: normalizedInput ? clone(normalizedInput.messages) : null,
      },
      inputHash: normalizedInput?.inputHash ?? null,
      parsedDialogueReference,
    },
    selection: {
      templateId: null,
      ratio: null,
      resolution: DEFAULT_RESOLUTION,
      background: {
        selection: DEFAULT_BACKGROUND,
        resolved: null,
      },
    },
    durationPlan: {
      compiledTotalDurationInFrames: null,
      compiledTotalDurationSeconds: null,
      internalSegmentReferences: [],
      outputMode: null,
      userVisibleParts: [],
    },
    preview: {
      revision: 0,
      status: 'not_generated',
      artifact: null,
      representativeFrame: null,
      generatedAt: null,
      approvedAt: null,
      rejectedAt: null,
      rejectionSummary: null,
      approvalValid: false,
      failureSummary: null,
      manifestSyncPending: false,
      finalParameterConfirmationPending: false,
      parts: {},
      history: [],
    },
    locks: {
      contentLocked: false,
      backgroundLocked: false,
      templateLocked: false,
      twoPartException: {
        eligible: false,
        used: false,
        previousTemplateId: null,
        replacementTemplateId: null,
        userVisiblePart: null,
      },
    },
    render: {
      overallStatus: 'not_started',
      failedPart: null,
      retry: {attempt: 0, resumeFromPart: null},
      manifestSyncPending: false,
      manifestSyncFailure: null,
      history: [],
      finalizedAt: null,
      parts: [],
    },
    delivery: {
      ...delivery,
      finalFilenames: [],
    },
    workflow: {
      stateReference: workflowStateReference,
    },
  };
};

/** A retry copies orchestration metadata but never assigns a new job identity. */
export const resumeSkillJob = (skillJob) => {
  assertFilesystemSafeJobId(skillJob?.jobId);
  return clone(skillJob);
};

export const validateSkillSelection = ({templateId, ratio, resolution = DEFAULT_RESOLUTION, background = DEFAULT_BACKGROUND}) => {
  if (!templateId) throw new Error('Template id is required.');
  if (!ratio) throw new Error('Ratio is required.');
  requirePreviewTemplate(templateId, ratio);
  if (!['720p', '1080p'].includes(resolution)) {
    throw new Error(`Unsupported final resolution: ${resolution}`);
  }
  if (!background || typeof background !== 'string') throw new Error('Background selection is required.');
  return {
    templateId,
    ratio,
    resolution,
    background: {
      selection: background,
      resolved: null,
    },
  };
};

export const attachSkillSelection = (skillJob, selection) => {
  const next = clone(skillJob);
  const validated = validateSkillSelection({
    templateId: selection?.templateId,
    ratio: selection?.ratio,
    resolution: selection?.resolution,
    background: selection?.background?.selection ?? selection?.background,
  });
  next.selection = validated;
  next.status = 'selection_complete';
  return next;
};

const messageEndFrames = (timeline) => new Set((timeline.messages ?? []).flatMap((message) => {
  if (message.speaker === 'user') {
    return [Number(message.startFrame ?? 0) + Number(message.enterFrames ?? 0)];
  }
  return [Number(message.revealStartFrame ?? 0) + Number(message.revealFrames ?? 0)];
}).filter(Number.isFinite));

const messageRange = (message) => {
  if (message.speaker === 'user') {
    const start = Number(message.startFrame ?? 0);
    return {start, end: start + Number(message.enterFrames ?? 0)};
  }
  const start = Number(message.typingStartFrame ?? 0);
  return {start, end: Number(message.revealStartFrame ?? start) + Number(message.revealFrames ?? 0)};
};

const sourceRangeFor = (timeline, start, end) => ({
  messageIds: (timeline.messages ?? []).filter((message) => {
    const range = messageRange(message);
    return range.start < end && range.end > start;
  }).map((message) => message.id),
});

const validateInternalSegments = (timeline, segmentManifest, fps) => {
  const parts = segmentManifest?.parts;
  if (!Array.isArray(parts) || !parts.length) throw new Error('Internal segment manifest with at least one segment is required.');
  let expectedStart = 0;
  for (const segment of parts) {
    const start = Number(segment.globalStartFrame);
    const end = Number(segment.globalEndFrameExclusive);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start !== expectedStart || end <= start) {
      throw new Error('Internal segments must be contiguous global-frame ranges beginning at frame 0.');
    }
    if (end - start > USER_VISIBLE_PART_MAX_FRAMES) {
      throw new Error('NEEDS USER DECISION: INTERNAL_SEGMENT_EXCEEDS_20_SECONDS');
    }
    expectedStart = end;
  }
  if (expectedStart !== Number(timeline.durationInFrames)) {
    throw new Error('Internal segment ranges must end at the compiled timeline duration.');
  }
  if (Number(segmentManifest.fps ?? fps) !== fps) throw new Error('Internal segment FPS must match the compiled timeline FPS.');
};

const buildUserVisiblePart = ({timeline, internalSegments, startIndex, endIndex, fps}) => {
  const first = internalSegments[startIndex];
  const last = internalSegments[endIndex];
  const start = Number(first.globalStartFrame);
  const end = Number(last.globalEndFrameExclusive);
  return {
    index: startIndex === 0 ? 1 : null,
    internalSegmentIndexes: internalSegments.slice(startIndex, endIndex + 1).map((segment) => Number(segment.part)),
    timelineStart: start,
    timelineEnd: end,
    durationInFrames: end - start,
    durationSeconds: seconds(end - start, fps),
    sourceRange: sourceRangeFor(timeline, start, end),
  };
};

/**
 * Groups existing contiguous 3–8 second internal segments into user-visible
 * Parts. It never slices raw global frames: all cuts are existing segment
 * boundaries, with completed-message boundaries preferred when available.
 */
export const planUserVisibleParts = ({timeline, segmentManifest}) => {
  const fps = Number(timeline?.fps ?? 24);
  const total = Number(timeline?.durationInFrames ?? 0);
  if (fps !== 24) throw new Error('Skill user-visible Part planning requires the existing 24fps timeline.');
  if (!Number.isInteger(total) || total <= 0) throw new Error('Compiled timeline duration must be a positive integer.');
  validateInternalSegments(timeline, segmentManifest, fps);
  const internalSegments = segmentManifest.parts;

  if (total <= USER_VISIBLE_PART_MAX_FRAMES) {
    const only = buildUserVisiblePart({timeline, internalSegments, startIndex: 0, endIndex: internalSegments.length - 1, fps});
    return {
      outputMode: 'single',
      totalDurationInFrames: total,
      totalDurationSeconds: seconds(total, fps),
      parts: [{...only, index: 1}],
    };
  }

  const semanticEnds = messageEndFrames(timeline);
  const parts = [];
  let startIndex = 0;
  while (startIndex < internalSegments.length) {
    const start = Number(internalSegments[startIndex].globalStartFrame);
    const candidates = [];
    for (let endIndex = startIndex; endIndex < internalSegments.length; endIndex++) {
      const end = Number(internalSegments[endIndex].globalEndFrameExclusive);
      if (end - start > USER_VISIBLE_PART_MAX_FRAMES) break;
      candidates.push(endIndex);
    }
    if (!candidates.length) {
      throw new Error('NEEDS USER DECISION: NO_SAFE_USER_VISIBLE_PART_BOUNDARY');
    }
    const semanticCandidates = candidates.filter((endIndex) => semanticEnds.has(Number(internalSegments[endIndex].globalEndFrameExclusive)));
    const endIndex = (semanticCandidates.length ? semanticCandidates : candidates).at(-1);
    const part = buildUserVisiblePart({timeline, internalSegments, startIndex, endIndex, fps});
    parts.push({...part, index: parts.length + 1});
    startIndex = endIndex + 1;
  }

  return {
    outputMode: 'multipart',
    totalDurationInFrames: total,
    totalDurationSeconds: seconds(total, fps),
    parts,
  };
};

export const attachUserVisiblePlan = (skillJob, plan) => {
  if (!['single', 'multipart'].includes(plan?.outputMode) || !Array.isArray(plan?.parts) || !plan.parts.length) {
    throw new Error('A complete user-visible Part plan is required.');
  }
  const next = clone(skillJob);
  const output = planSkillOutput({
    jobId: next.jobId,
    outputRoot: next.delivery.outputRoot,
    outputMode: plan.outputMode,
    partCount: plan.parts.length,
  });
  next.durationPlan = {
    compiledTotalDurationInFrames: plan.totalDurationInFrames,
    compiledTotalDurationSeconds: plan.totalDurationSeconds,
    internalSegmentReferences: plan.parts.map((part) => ({
      index: part.index,
      internalSegmentIndexes: clone(part.internalSegmentIndexes),
      timelineStart: part.timelineStart,
      timelineEnd: part.timelineEnd,
    })),
    outputMode: plan.outputMode,
    userVisibleParts: clone(plan.parts),
  };
  next.render.parts = plan.parts.map((part, index) => ({
    index: part.index,
    status: 'pending',
    filename: output.filenames[index],
    timelineStart: part.timelineStart,
    timelineEnd: part.timelineEnd,
    duration: {frames: part.durationInFrames, seconds: part.durationSeconds},
    templateId: next.selection.templateId,
    startedAt: null,
    completedAt: null,
    failedAt: null,
    outputPath: null,
    attempts: 0,
    errorSummary: null,
  }));
  next.delivery = {...output, finalFilenames: clone(output.filenames)};
  next.locks.twoPartException = {...next.locks.twoPartException, eligible: plan.parts.length === 2};
  next.status = 'planned';
  return next;
};

export const buildDeliveryManifest = ({skillJob, skillVersion, canonicalBuildIdentifier, sourceBaseline = null}) => {
  if (!skillJob?.selection?.templateId || !skillJob?.durationPlan?.outputMode) {
    throw new Error('Skill job must have a validated selection and a user-visible Part plan before building a delivery manifest.');
  }
  if (!skillVersion || !canonicalBuildIdentifier) {
    throw new Error('Skill version and canonical build identifier are required for delivery manifest planning.');
  }
  if (sourceBaseline !== null && (typeof sourceBaseline !== 'string' || !sourceBaseline)) {
    throw new Error('Source baseline must be a non-empty string when provided.');
  }
  const filenames = skillJob.delivery?.finalFilenames ?? [];
  const partStatuses = new Map((skillJob.render?.parts ?? []).map((part) => [part.index, part]));
  return {
    schemaVersion: DELIVERY_MANIFEST_SCHEMA_VERSION,
    jobId: skillJob.jobId,
    skillVersion,
    canonicalBuildIdentifier,
    ...(sourceBaseline ? {sourceBaseline} : {}),
    templateId: skillJob.selection.templateId,
    ratio: skillJob.selection.ratio,
    resolution: skillJob.selection.resolution,
    resolvedBackground: skillJob.selection.background.resolved,
    backgroundSelection: skillJob.selection.background.selection,
    totalDuration: {
      frames: skillJob.durationPlan.compiledTotalDurationInFrames,
      seconds: skillJob.durationPlan.compiledTotalDurationSeconds,
    },
    outputType: skillJob.durationPlan.outputMode,
    partCount: skillJob.durationPlan.userVisibleParts.length,
    parts: skillJob.durationPlan.userVisibleParts.map((part, index) => ({
      index: part.index,
      filename: filenames[index],
      duration: {frames: part.durationInFrames, seconds: part.durationSeconds},
      timelineStart: part.timelineStart,
      timelineEnd: part.timelineEnd,
      sourceRange: clone(part.sourceRange),
      templateId: partStatuses.get(part.index)?.templateId ?? skillJob.selection.templateId,
      status: partStatuses.get(part.index)?.status ?? 'pending',
      startedAt: partStatuses.get(part.index)?.startedAt ?? null,
      completedAt: partStatuses.get(part.index)?.completedAt ?? null,
      failedAt: partStatuses.get(part.index)?.failedAt ?? null,
      outputPath: partStatuses.get(part.index)?.outputPath ?? null,
      attempts: partStatuses.get(part.index)?.attempts ?? 0,
      errorSummary: partStatuses.get(part.index)?.errorSummary ?? null,
    })),
    preview: clone(skillJob.preview),
    lock: clone(skillJob.locks),
    continuity: {
      guarantee: !skillJob.locks.twoPartException.used,
      twoPartExceptionUsed: skillJob.locks.twoPartException.used,
    },
    retry: clone(skillJob.render.retry),
    render: {
      manifestSyncPending: Boolean(skillJob.render.manifestSyncPending),
      manifestSyncFailure: skillJob.render.manifestSyncFailure ?? null,
      finalizedAt: skillJob.render.finalizedAt ?? null,
      history: clone(skillJob.render.history ?? []),
    },
    finalParameters: clone(skillJob.finalParameters ?? null),
    overallStatus: skillJob.status,
    renderStatus: skillJob.render.overallStatus,
  };
};

/**
 * Metadata-only map for the future thin adapter. Existing commands and state
 * functions remain authoritative; this module intentionally does not invoke
 * the renderer or reproduce command logic.
 */
export const WORKFLOW_ADAPTER_BOUNDARY = Object.freeze({
  prepare: {kind: 'cli', command: 'node scripts/cli/prepare-job.mjs'},
  selectTemplate: {kind: 'cli', command: 'node scripts/cli/workflow.mjs select-template'},
  selectBackground: {kind: 'cli', command: 'node scripts/cli/workflow.mjs select-background'},
  preview: {kind: 'cli', command: 'node scripts/cli/preview-job.mjs'},
  approvePreview: {kind: 'cli', command: 'node scripts/cli/workflow.mjs approve-preview'},
  render: {kind: 'cli', command: 'node scripts/cli/render-job.mjs'},
  finalize: {kind: 'cli', command: 'node scripts/cli/finalize-job.mjs'},
  doctor: {kind: 'cli', command: 'node scripts/maintenance/doctor.mjs'},
});
