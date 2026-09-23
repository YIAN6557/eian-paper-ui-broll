import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {writeBackgroundSidecars, BACKGROUND_ERRORS, previewCanvasForRatio} from './background-system.mjs';

const now = () => new Date().toISOString();
const clone = (v) => JSON.parse(JSON.stringify(v));
const makeId = (prefix) => `${prefix}-${crypto.randomUUID()}`;

export const DEFAULT_TEMPLATE = 't01-reference-research-console';
export const DEFAULT_BACKGROUND = 'b01-matte-paper';

const event = (type, data = {}) => ({at: now(), type, ...data});

const freshPreview = () => ({
  status: 'not_generated', path: null, template: null, background: null,
  backgroundRenderStateId: null, sourceVisualRevision: null, approvedAt: null,
});

const refreshDraftVisualConfig = (state) => {
  state.visual = state.visual ?? {};
  state.visual.draftVisualConfig = {
    schemaVersion: 1,
    templateId: state.selection.template,
    background: {
      backgroundId: state.selection.background,
      ...(state.selection.backgroundAnchor ? {anchor: state.selection.backgroundAnchor} : {}),
    },
    revision: state.visual.revision ?? 1,
    status: 'draft',
  };
};

const invalidateVisual = (state, reason, {background = true} = {}) => {
  state.visual.revision = Number(state.visual.revision ?? 1) + 1;
  if (background) {
    state.visual.backgroundRevision = Number(state.visual.backgroundRevision ?? 1) + 1;
    if (state.visual.backgroundRenderState) state.visual.backgroundRenderState.status = 'invalid';
    state.visual.backgroundRenderStateStatus = 'invalid';
  }
  if (state.visual.previewState) {
    state.visual.previewState.status = 'invalid';
    state.visual.previewState.confirmation = {confirmed:false, confirmedAt:null};
  }
  state.preview.global = freshPreview();
  refreshDraftVisualConfig(state);
  state.events.push(event('global-preview-invalidated', {reason, visualRevision:state.visual.revision}));
  if (background) state.events.push(event('background-render-state-invalidated', {reason, visualRevision:state.visual.revision, backgroundRevision:state.visual.backgroundRevision}));
};

export const makeWorkflowState = ({
  jobId,
  dialoguePath,
  timelinePath,
  segmentsPath,
  ratio = '9:16',
  outputBaseName = 'paper-ui-broll',
  outputDir = 'output',
  recommendedTemplate = DEFAULT_TEMPLATE,
  background = DEFAULT_BACKGROUND,
  manifest,
  userVisibleParts = [],
}) => {
  if (!manifest?.parts?.length) throw new Error('Segmentation manifest with at least one part is required.');
  const state = {
    schemaVersion: '1.1',
    jobId,
    phase: 'prepared',
    createdAt: now(),
    updatedAt: now(),
    input: {dialoguePath, ratio, outputBaseName},
    assets: {timelinePath, segmentsPath, outputDir},
    recommendation: {
      template: recommendedTemplate,
      reason: 'T01 is the current locked Paper Research Console baseline.',
    },
    selection: {
      template: null,
      background,
      backgroundAnchor: 'center',
      backgroundUser: null,
    },
    locks: {
      contentLocked: false,
      templateLocked: false,
      templateLockedAtPart: null,
      backgroundLocked: false,
      backgroundLockedStateId: null,
      continuityGuarantee: true,
      partTemplateOverrides: {},
      userVisiblePartTemplateOverrides: {},
    },
    visual: {
      revision: 1,
      backgroundRevision: 1,
      draftVisualConfig: null,
      backgroundRenderState: null,
      backgroundRenderStateStatus: 'not_resolved',
      previewState: null,
      productionVisualLock: null,
      renderManifest: null,
    },
    preview: {global:freshPreview(), parts:{}, userVisibleParts:{}},
    parts: manifest.parts.map((p) => ({
      ...p,
      status: 'pending',
      formalRenderStarted: false,
      outputPath: null,
      error: null,
    })),
    userVisibleParts: [],
    events: [event('job-prepared', {partCount: manifest.parts.length})],
  };
  refreshDraftVisualConfig(state);
  return attachUserVisibleParts(state, userVisibleParts);
};

const userVisiblePartFor = (state, userVisiblePartNumber) => (
  (state.userVisibleParts ?? []).find((part) => Number(part.index) === Number(userVisiblePartNumber)) ?? null
);

const internalPartsForUserVisiblePart = (state, userVisiblePart) => {
  const indexes = new Set((userVisiblePart?.internalSegmentIndexes ?? []).map(Number));
  return state.parts.filter((part) => indexes.has(Number(part.part)));
};

export const attachUserVisibleParts = (inputState, userVisibleParts) => {
  const state = clone(inputState);
  if (!Array.isArray(userVisibleParts) || !userVisibleParts.length) return state;
  if (state.parts.some((part) => part.formalRenderStarted)) {
    throw new Error('User-visible Part mapping cannot change after formal rendering starts.');
  }
  const normalized = userVisibleParts.map((part, index) => ({
    index: Number(part.index ?? index + 1),
    internalSegmentIndexes: [...(part.internalSegmentIndexes ?? [])].map(Number),
    timelineStart: Number(part.timelineStart),
    timelineEnd: Number(part.timelineEnd),
  }));
  if (normalized.some((part, index) => part.index !== index + 1 || !part.internalSegmentIndexes.length || !Number.isInteger(part.timelineStart) || !Number.isInteger(part.timelineEnd) || part.timelineEnd <= part.timelineStart)) {
    throw new Error('User-visible Parts must be sequential non-empty timeline groups.');
  }
  const covered = normalized.flatMap((part) => part.internalSegmentIndexes);
  const expected = state.parts.map((part) => Number(part.part));
  if (covered.length !== expected.length || new Set(covered).size !== covered.length || covered.some((part, index) => part !== expected[index])) {
    throw new Error('User-visible Parts must cover each internal segment exactly once in timeline order.');
  }
  state.userVisibleParts = normalized;
  state.events.push(event('user-visible-parts-attached', {partCount: normalized.length}));
  return state;
};

export const readState = (statePath) => JSON.parse(fs.readFileSync(statePath, 'utf8'));

export const writeState = (statePath, state) => {
  const next = clone(state);
  next.updatedAt = now();
  refreshDraftVisualConfig(next);
  fs.mkdirSync(path.dirname(path.resolve(statePath)), {recursive: true});
  fs.writeFileSync(statePath, JSON.stringify(next, null, 2) + '\n');
  writeBackgroundSidecars(next);
  return next;
};

export const selectTemplate = (inputState, template, {part = null, userVisiblePart = null} = {}) => {
  const state = clone(inputState);
  if (!template) throw new Error('Template id is required.');
  if (part !== null && userVisiblePart !== null) throw new Error('Select either an internal Part or a user-visible Part template override, not both.');

  if (!state.locks.templateLocked) {
    if (part !== null || userVisiblePart !== null) throw new Error('Part-specific template selection is only available through the two-part exception after the template is locked.');
    if (state.selection.template !== template) {
      state.selection.template = template;
      invalidateVisual(state, 'template-changed-before-render', {background:false});
    }
    state.phase = 'template-selected';
    state.events.push(event('template-selected', {template}));
    return state;
  }

  const groupedParts = state.userVisibleParts ?? [];
  if (groupedParts.length) {
    if (groupedParts.length === 2 && userVisiblePart === 2) {
      const first = userVisiblePartFor(state, 1);
      const second = userVisiblePartFor(state, 2);
      const firstInternal = internalPartsForUserVisiblePart(state, first);
      const secondInternal = internalPartsForUserVisiblePart(state, second);
      const eligible = firstInternal.length > 0 && firstInternal.every((partState) => partState.status === 'completed') &&
        secondInternal.length > 0 && secondInternal.every((partState) => !partState.formalRenderStarted && partState.status !== 'completed');
      if (eligible) {
        state.locks.userVisiblePartTemplateOverrides['2'] = template;
        state.locks.continuityGuarantee = false;
        state.preview.userVisibleParts = state.preview.userVisibleParts ?? {};
        state.preview.userVisibleParts['2'] = {...freshPreview(), template, background:state.selection.background};
        state.phase = 'exception-template-change-awaiting-preview';
        if (state.visual?.productionVisualLock?.template?.exception) {
          state.visual.productionVisualLock.template.exception = {eligible:true, used:true, part:2, continuityGuaranteed:false, scope:'user-visible-part'};
        }
        if (state.visual?.renderManifest) {
          state.visual.renderManifest.renderManifestVersion = Number(state.visual.renderManifest.renderManifestVersion ?? 1) + 1;
          const secondIndexes = new Set(second.internalSegmentIndexes.map(Number));
          for (const renderPart of state.visual.renderManifest.parts) {
            if (secondIndexes.has(Number(renderPart.partNumber))) renderPart.templateId = template;
          }
        }
        state.events.push(event('template-changed-under-two-part-exception', {
          part:2, scope:'user-visible-part', template, continuityGuarantee:false,
          backgroundRenderStateId:state.locks.backgroundLockedStateId,
        }));
        return state;
      }
    }
    throw new Error('Template is locked after formal rendering starts. Mid-production template changes are only allowed when there are exactly two user-visible Parts, user-visible Part 1 is completed, and user-visible Part 2 has not started formal rendering.');
  }

  // Legacy standalone workflow behavior remains unchanged when no user-visible mapping exists.
  if (state.parts.length === 2 && part === 2) {
    const p1 = state.parts[0];
    const p2 = state.parts[1];
    const eligible = p1.status === 'completed' && !p2.formalRenderStarted && p2.status !== 'completed';
    if (eligible) {
      state.locks.partTemplateOverrides['2'] = template;
      state.locks.continuityGuarantee = false;
      state.preview.parts['2'] = freshPreview();
      state.preview.parts['2'].template = template;
      state.preview.parts['2'].background = state.selection.background;
      state.phase = 'exception-template-change-awaiting-preview';
      if (state.visual?.productionVisualLock?.template?.exception) {
        state.visual.productionVisualLock.template.exception = {eligible:true, used:true, part:2, continuityGuaranteed:false};
      }
      if (state.visual?.renderManifest) {
        state.visual.renderManifest.renderManifestVersion = Number(state.visual.renderManifest.renderManifestVersion ?? 1) + 1;
        const p = state.visual.renderManifest.parts.find((x) => x.partNumber === 2);
        if (p) p.templateId = template;
      }
      state.events.push(event('template-changed-under-two-part-exception', {
        part:2, template, continuityGuarantee:false,
        backgroundRenderStateId:state.locks.backgroundLockedStateId,
      }));
      return state;
    }
  }

  throw new Error('Template is locked after formal rendering starts. Mid-production template changes are not allowed, except when there are exactly 2 parts, Part 1 is completed, and Part 2 has not started formal rendering.');
};

export const selectBackground = (inputState, background, {anchor = null, userDefinition = null} = {}) => {
  const state = clone(inputState);
  if (!background) throw new Error('Background id is required.');
  if (state.locks.backgroundLocked) {
    throw new Error(BACKGROUND_ERRORS.BACKGROUND_LOCKED);
  }
  const changed = state.selection.background !== background ||
    (anchor !== null && state.selection.backgroundAnchor !== anchor) ||
    JSON.stringify(state.selection.backgroundUser) !== JSON.stringify(userDefinition);
  state.selection.background = background;
  if (anchor !== null) state.selection.backgroundAnchor = anchor;
  state.selection.backgroundUser = userDefinition;
  if (changed) invalidateVisual(state, 'background-changed-before-lock');
  state.events.push(event('background-selected', {background, anchor:state.selection.backgroundAnchor}));
  return state;
};

export const attachResolvedBackground = (inputState, backgroundRenderState) => {
  const state = clone(inputState);
  state.visual.backgroundRenderState = clone(backgroundRenderState);
  state.visual.backgroundRenderStateStatus = backgroundRenderState.status;
  state.events.push(event('background-state-attached', {
    backgroundRenderStateId:backgroundRenderState.id,
    backgroundId:backgroundRenderState.backgroundId,
    visualRevision:backgroundRenderState.sourceVisualRevision,
  }));
  return state;
};

export const markPreviewReady = (inputState, {path: previewPath, part = null, userVisiblePart = null} = {}) => {
  const state = clone(inputState);
  if (!state.selection.template) throw new Error('Select a template before generating preview.');
  if (!previewPath) throw new Error('Preview path is required.');
  if (part !== null && userVisiblePart !== null) throw new Error('Preview can target either an internal Part or a user-visible Part, not both.');
  const bg = state.visual?.backgroundRenderState;
  if (!bg || bg.status !== 'resolved') throw new Error(BACKGROUND_ERRORS.BACKGROUND_STATE_NOT_RESOLVED);
  if (Number(bg.sourceBackgroundRevision ?? bg.sourceVisualRevision) !== Number(state.visual.backgroundRevision ?? state.visual.revision)) throw new Error(BACKGROUND_ERRORS.BACKGROUND_STATE_REVISION_MISMATCH);

  if (part === null && userVisiblePart === null) {
    state.preview.global = {
      status: 'ready', path: previewPath, template: state.selection.template,
      background: state.selection.background, backgroundRenderStateId:bg.id,
      sourceVisualRevision:state.visual.revision, approvedAt: null,
    };
    state.visual.previewState = {
      schemaVersion:1,
      id:makeId('PREVIEW'),
      status:'ready',
      sourceVisualRevision:state.visual.revision,
      templateId:state.selection.template,
      backgroundRenderStateId:bg.id,
      resolution:previewCanvasForRatio(state.input?.ratio ?? '9:16'),
      asset:previewPath,
      confirmation:{confirmed:false,confirmedAt:null},
    };
    state.phase = 'preview-ready';
    state.events.push(event('global-preview-ready', {path: previewPath, backgroundRenderStateId:bg.id, visualRevision:state.visual.revision}));
    return state;
  }

  if (userVisiblePart !== null) {
    if (userVisiblePart !== 2 || (state.userVisibleParts ?? []).length !== 2) throw new Error('User-visible Part preview is only used for the confirmed two-part template-change exception.');
    const template = state.locks.userVisiblePartTemplateOverrides?.['2'];
    if (!template) throw new Error('No user-visible Part 2 template override exists.');
    state.preview.userVisibleParts = state.preview.userVisibleParts ?? {};
    state.preview.userVisibleParts['2'] = {
      status:'ready', path:previewPath, template, background:state.selection.background,
      backgroundRenderStateId:bg.id, sourceVisualRevision:state.visual.revision, approvedAt:null,
    };
    state.phase = 'exception-preview-ready';
    state.events.push(event('user-visible-part-preview-ready', {part:2, path:previewPath, template, backgroundRenderStateId:bg.id}));
    return state;
  }

  if (part !== 2 || state.parts.length !== 2) throw new Error('Part-specific preview is only used for the confirmed two-part template-change exception.');
  const template = state.locks.partTemplateOverrides['2'];
  if (!template) throw new Error('No Part 2 template override exists.');
  state.preview.parts['2'] = {
    status:'ready', path:previewPath, template, background:state.selection.background,
    backgroundRenderStateId:bg.id, sourceVisualRevision:state.visual.revision, approvedAt:null,
  };
  state.phase = 'exception-preview-ready';
  state.events.push(event('part-preview-ready', {part:2, path:previewPath, template, backgroundRenderStateId:bg.id}));
  return state;
};

/**
 * Revokes a global Preview approval before formal rendering starts. The caller
 * performs the explicitly requested selection or input change afterwards; this
 * helper only returns the authoritative Preview Gate to its regeneration state.
 */
export const invalidatePreviewApproval = (inputState, {reason = 'skill-preview-input-changed'} = {}) => {
  const state = clone(inputState);
  if (state.parts.some((part) => part.formalRenderStarted)) {
    throw new Error('Preview approval cannot be invalidated after formal rendering starts.');
  }
  if (state.preview?.global?.status !== 'approved') {
    throw new Error('Only an approved global Preview can be invalidated.');
  }
  state.locks.contentLocked = false;
  state.locks.backgroundLocked = false;
  state.locks.backgroundLockedStateId = null;
  invalidateVisual(state, reason);
  state.phase = 'preview-required';
  state.events.push(event('global-preview-approval-invalidated', {reason}));
  return state;
};

export const approvePreview = (inputState, {part = null, userVisiblePart = null} = {}) => {
  const state = clone(inputState);
  if (part !== null && userVisiblePart !== null) throw new Error('Preview approval can target either an internal Part or a user-visible Part, not both.');
  if (part === null && userVisiblePart === null) {
    const p = state.preview.global;
    const bg = state.visual?.backgroundRenderState;
    if (p.status !== 'ready') throw new Error('Global preview must be generated before approval.');
    if (!bg || bg.status !== 'resolved') throw new Error(BACKGROUND_ERRORS.BACKGROUND_STATE_NOT_RESOLVED);
    if (p.backgroundRenderStateId !== bg.id) throw new Error(BACKGROUND_ERRORS.PREVIEW_BACKGROUND_STATE_MISMATCH);
    if (Number(p.sourceVisualRevision) !== Number(state.visual.revision) || Number(bg.sourceBackgroundRevision ?? bg.sourceVisualRevision) !== Number(state.visual.backgroundRevision ?? state.visual.revision)) {
      throw new Error(BACKGROUND_ERRORS.BACKGROUND_STATE_REVISION_MISMATCH);
    }
    p.status = 'approved';
    p.approvedAt = now();
    state.locks.contentLocked = true;
    state.locks.backgroundLocked = true;
    state.locks.backgroundLockedStateId = bg.id;
    if (state.visual.previewState) state.visual.previewState.confirmation = {confirmed:true, confirmedAt:p.approvedAt};
    state.phase = 'approved';
    state.events.push(event('global-preview-approved', {contentLocked:true, backgroundLocked:true, backgroundRenderStateId:bg.id}));
    state.events.push(event('background-locked', {background:state.selection.background, backgroundRenderStateId:bg.id}));
    return state;
  }

  if (userVisiblePart !== null) {
    if (userVisiblePart !== 2 || (state.userVisibleParts ?? []).length !== 2) throw new Error('User-visible Part preview approval is only valid for the two-part exception.');
    const p = state.preview.userVisibleParts?.['2'];
    if (!p || p.status !== 'ready') throw new Error('User-visible Part 2 exception preview must be generated before approval.');
    if (p.backgroundRenderStateId !== state.locks.backgroundLockedStateId) throw new Error(BACKGROUND_ERRORS.PREVIEW_BACKGROUND_STATE_MISMATCH);
    p.status = 'approved';
    p.approvedAt = now();
    state.phase = 'approved-for-user-visible-part-2-exception';
    state.events.push(event('user-visible-part-preview-approved', {part:2, template:p.template, backgroundRenderStateId:p.backgroundRenderStateId}));
    return state;
  }

  if (part !== 2 || state.parts.length !== 2) throw new Error('Part-specific preview approval is only valid for the two-part exception.');
  const p = state.preview.parts['2'];
  if (!p || p.status !== 'ready') throw new Error('Part 2 exception preview must be generated before approval.');
  if (p.backgroundRenderStateId !== state.locks.backgroundLockedStateId) throw new Error(BACKGROUND_ERRORS.PREVIEW_BACKGROUND_STATE_MISMATCH);
  p.status = 'approved';
  p.approvedAt = now();
  state.phase = 'approved-for-part-2-exception';
  state.events.push(event('part-preview-approved', {part:2, template:p.template, backgroundRenderStateId:p.backgroundRenderStateId}));
  return state;
};

export const resolvedTemplateForUserVisiblePart = (state, userVisiblePartNumber) => (
  state.locks.userVisiblePartTemplateOverrides?.[String(userVisiblePartNumber)] ?? state.selection.template
);

export const resolvedTemplateForPart = (state, partNumber) => {
  const visible = (state.userVisibleParts ?? []).find((group) => group.internalSegmentIndexes.map(Number).includes(Number(partNumber)));
  if (visible && state.locks.userVisiblePartTemplateOverrides?.[String(visible.index)]) return state.locks.userVisiblePartTemplateOverrides[String(visible.index)];
  return state.locks.partTemplateOverrides[String(partNumber)] ?? state.selection.template;
};

const hasApprovalForUserVisiblePart = (state, userVisiblePartNumber) => {
  const override = state.locks.userVisiblePartTemplateOverrides?.[String(userVisiblePartNumber)];
  if (override) {
    const preview = state.preview.userVisibleParts?.[String(userVisiblePartNumber)];
    return preview?.status === 'approved' && preview.template === override && preview.backgroundRenderStateId === state.locks.backgroundLockedStateId;
  }
  return state.preview.global.status === 'approved' &&
    state.preview.global.template === state.selection.template &&
    state.preview.global.backgroundRenderStateId === state.locks.backgroundLockedStateId;
};

const hasApprovalForPart = (state, partNumber) => {
  const visible = (state.userVisibleParts ?? []).find((group) => group.internalSegmentIndexes.map(Number).includes(Number(partNumber)));
  if (visible) return hasApprovalForUserVisiblePart(state, visible.index);
  const override = state.locks.partTemplateOverrides[String(partNumber)];
  if (override) {
    const p = state.preview.parts[String(partNumber)];
    return p?.status === 'approved' && p.template === override && p.backgroundRenderStateId === state.locks.backgroundLockedStateId;
  }
  return state.preview.global.status === 'approved' &&
    state.preview.global.template === state.selection.template &&
    state.preview.global.backgroundRenderStateId === state.locks.backgroundLockedStateId;
};

const ensureProductionVisualLock = (state) => {
  if (state.visual.productionVisualLock) return;
  const bg = state.visual.backgroundRenderState;
  state.visual.productionVisualLock = {
    schemaVersion:1,
    id:makeId('VISUALLOCK'),
    status:'locked',
    sourceVisualRevision:state.visual.revision,
    template:{
      id:state.selection.template,
      locked:true,
      exception:{eligible:(state.userVisibleParts?.length || state.parts.length) === 2, used:false},
    },
    background:{
      backgroundId:bg.backgroundId,
      backgroundRenderStateId:bg.id,
      locked:true,
    },
    sourcePreviewId:state.visual.previewState?.id ?? null,
    createdAt:now(),
  };
};

const ensureRenderManifest = (state) => {
  if (state.visual.renderManifest) return;
  const lock = state.visual.productionVisualLock;
  state.visual.renderManifest = {
    schemaVersion:1,
    jobId:state.jobId,
    renderManifestVersion:1,
    visualLockStateId:lock.id,
    backgroundRenderStateId:lock.background.backgroundRenderStateId,
    templateId:lock.template.id,
    fps:24,
    codec:'h264',
    container:'mp4',
    parts:state.parts.map((p) => ({
      partNumber:p.part,
      timelinePath:state.assets.timelinePath,
      globalStartFrame:p.globalStartFrame,
      globalEndFrameExclusive:p.globalEndFrameExclusive,
      visualLockStateId:lock.id,
      backgroundRenderStateId:lock.background.backgroundRenderStateId,
      templateId:resolvedTemplateForPart(state,p.part),
    })),
  };
};

export const beginPartRender = (inputState, partNumber) => {
  const state = clone(inputState);
  const part = state.parts.find((p) => p.part === Number(partNumber));
  if (!part) throw new Error(`Unknown part: ${partNumber}`);
  if (part.status === 'completed') throw new Error(`Part ${partNumber} is already completed.`);
  if (!hasApprovalForPart(state, Number(partNumber))) {
    throw new Error(`Part ${partNumber} does not have an approved preview for its resolved template.`);
  }
  if (!state.selection.template) throw new Error('Template must be selected before formal render.');
  if (!state.locks.contentLocked) throw new Error('Dialogue content must be locked by preview approval before formal render.');
  if (!state.locks.backgroundLocked || !state.locks.backgroundLockedStateId) throw new Error(BACKGROUND_ERRORS.BACKGROUND_LOCKED);
  if (state.visual?.backgroundRenderState?.id !== state.locks.backgroundLockedStateId || state.visual.backgroundRenderState.status !== 'resolved') {
    throw new Error(BACKGROUND_ERRORS.BACKGROUND_STATE_NOT_RESOLVED);
  }

  if (!state.locks.templateLocked) {
    state.locks.templateLocked = true;
    state.locks.templateLockedAtPart = Number(partNumber);
    state.events.push(event('template-locked', {template: state.selection.template, atPart: Number(partNumber)}));
  }

  ensureProductionVisualLock(state);
  ensureRenderManifest(state);

  part.status = 'rendering';
  part.formalRenderStarted = true;
  part.error = null;
  state.phase = 'rendering';
  state.events.push(event('part-render-started', {
    part:Number(partNumber),
    template:resolvedTemplateForPart(state, Number(partNumber)),
    backgroundRenderStateId:state.locks.backgroundLockedStateId,
  }));
  return state;
};

export const completePartRender = (inputState, partNumber, outputPath) => {
  const state = clone(inputState);
  const part = state.parts.find((p) => p.part === Number(partNumber));
  if (!part) throw new Error(`Unknown part: ${partNumber}`);
  if (part.status !== 'rendering') throw new Error(`Part ${partNumber} is not currently rendering.`);
  part.status = 'completed';
  part.outputPath = outputPath;
  part.error = null;
  const allDone = state.parts.every((p) => p.status === 'completed');
  state.phase = allDone ? 'completed' : 'between-parts';
  state.events.push(event('part-render-completed', {part:Number(partNumber), outputPath}));
  if (allDone) state.events.push(event('job-completed', {continuityGuarantee:state.locks.continuityGuarantee}));
  return state;
};

export const failPartRender = (inputState, partNumber, errorMessage) => {
  const state = clone(inputState);
  const part = state.parts.find((p) => p.part === Number(partNumber));
  if (!part) throw new Error(`Unknown part: ${partNumber}`);
  part.status = 'failed';
  part.error = String(errorMessage ?? 'Unknown render error');
  state.phase = 'failed';
  state.events.push(event('part-render-failed', {part:Number(partNumber), error:part.error}));
  return state;
};

export const beginUserVisiblePartRender = (inputState, userVisiblePartNumber) => {
  const state = clone(inputState);
  const visible = userVisiblePartFor(state, userVisiblePartNumber);
  if (!visible) throw new Error(`Unknown user-visible Part: ${userVisiblePartNumber}`);
  const internal = internalPartsForUserVisiblePart(state, visible);
  if (!internal.length) throw new Error(`User-visible Part ${userVisiblePartNumber} has no internal segments.`);
  if (internal.every((part) => part.status === 'completed')) throw new Error(`User-visible Part ${userVisiblePartNumber} is already completed.`);
  for (let index = 1; index < Number(userVisiblePartNumber); index += 1) {
    const prior = internalPartsForUserVisiblePart(state, userVisiblePartFor(state, index));
    if (!prior.every((part) => part.status === 'completed')) throw new Error(`User-visible Part ${userVisiblePartNumber} cannot start before Part ${index} completes.`);
  }
  if (!hasApprovalForUserVisiblePart(state, Number(userVisiblePartNumber))) {
    throw new Error(`User-visible Part ${userVisiblePartNumber} does not have an approved preview for its resolved template.`);
  }
  if (!state.selection.template) throw new Error('Template must be selected before formal render.');
  if (!state.locks.contentLocked) throw new Error('Dialogue content must be locked by preview approval before formal render.');
  if (!state.locks.backgroundLocked || !state.locks.backgroundLockedStateId) throw new Error(BACKGROUND_ERRORS.BACKGROUND_LOCKED);
  if (state.visual?.backgroundRenderState?.id !== state.locks.backgroundLockedStateId || state.visual.backgroundRenderState.status !== 'resolved') throw new Error(BACKGROUND_ERRORS.BACKGROUND_STATE_NOT_RESOLVED);
  if (!state.locks.templateLocked) {
    state.locks.templateLocked = true;
    state.locks.templateLockedAtPart = Number(userVisiblePartNumber);
    state.events.push(event('template-locked', {template:state.selection.template, atUserVisiblePart:Number(userVisiblePartNumber)}));
  }
  ensureProductionVisualLock(state);
  ensureRenderManifest(state);
  for (const part of internal) {
    const target = state.parts.find((candidate) => Number(candidate.part) === Number(part.part));
    target.status = 'rendering';
    target.formalRenderStarted = true;
    target.error = null;
  }
  state.phase = 'rendering';
  state.events.push(event('user-visible-part-render-started', {part:Number(userVisiblePartNumber), template:resolvedTemplateForUserVisiblePart(state, Number(userVisiblePartNumber)), backgroundRenderStateId:state.locks.backgroundLockedStateId}));
  return state;
};

export const completeUserVisiblePartRender = (inputState, userVisiblePartNumber, outputPath) => {
  const state = clone(inputState);
  const visible = userVisiblePartFor(state, userVisiblePartNumber);
  if (!visible) throw new Error(`Unknown user-visible Part: ${userVisiblePartNumber}`);
  const internal = internalPartsForUserVisiblePart(state, visible);
  if (!internal.every((part) => part.status === 'rendering')) throw new Error(`User-visible Part ${userVisiblePartNumber} is not currently rendering.`);
  for (const part of internal) {
    const target = state.parts.find((candidate) => Number(candidate.part) === Number(part.part));
    target.status = 'completed';
    target.outputPath = outputPath;
    target.error = null;
  }
  const allDone = state.parts.every((part) => part.status === 'completed');
  state.phase = allDone ? 'completed' : 'between-parts';
  state.events.push(event('user-visible-part-render-completed', {part:Number(userVisiblePartNumber), outputPath}));
  if (allDone) state.events.push(event('job-completed', {continuityGuarantee:state.locks.continuityGuarantee}));
  return state;
};

export const failUserVisiblePartRender = (inputState, userVisiblePartNumber, errorMessage) => {
  const state = clone(inputState);
  const visible = userVisiblePartFor(state, userVisiblePartNumber);
  if (!visible) throw new Error(`Unknown user-visible Part: ${userVisiblePartNumber}`);
  const failure = String(errorMessage ?? 'Unknown render error');
  for (const part of internalPartsForUserVisiblePart(state, visible)) {
    const target = state.parts.find((candidate) => Number(candidate.part) === Number(part.part));
    if (target.status !== 'completed') {
      target.status = 'failed';
      target.error = failure;
    }
  }
  state.phase = 'failed';
  state.events.push(event('user-visible-part-render-failed', {part:Number(userVisiblePartNumber), error:failure}));
  return state;
};

export const workflowSummary = (state) => ({
  jobId:state.jobId,
  phase:state.phase,
  partCount:state.parts.length,
  selectedTemplate:state.selection.template,
  background:state.selection.background,
  backgroundAnchor:state.selection.backgroundAnchor,
  visualRevision:state.visual?.revision,
  backgroundRevision:state.visual?.backgroundRevision,
  backgroundRenderStateId:state.visual?.backgroundRenderState?.id ?? null,
  contentLocked:state.locks.contentLocked,
  templateLocked:state.locks.templateLocked,
  backgroundLocked:state.locks.backgroundLocked,
  backgroundLockedStateId:state.locks.backgroundLockedStateId,
  continuityGuarantee:state.locks.continuityGuarantee,
  partTemplateOverrides:state.locks.partTemplateOverrides,
  userVisiblePartTemplateOverrides:state.locks.userVisiblePartTemplateOverrides ?? {},
  previewStatus:state.preview.global.status,
  parts:state.parts.map((p) => ({
    part:p.part, status:p.status, template:resolvedTemplateForPart(state,p.part), outputPath:p.outputPath,
  })),
});
