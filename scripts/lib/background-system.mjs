import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(HERE, '../..');
const REGISTRY_PATH = path.join(PROJECT_ROOT, 'assets/backgrounds/background-registry.json');

const clone = (v) => JSON.parse(JSON.stringify(v));
const id = (prefix) => `${prefix}-${crypto.randomUUID()}`;

export const BACKGROUND_ERRORS = Object.freeze({
  BACKGROUND_NOT_FOUND: 'BACKGROUND_NOT_FOUND',
  BACKGROUND_DISABLED: 'BACKGROUND_DISABLED',
  SOLID_BACKGROUND_COLOR_MISSING: 'SOLID_BACKGROUND_COLOR_MISSING',
  PAPER_BACKGROUND_ASSET_MISSING: 'PAPER_BACKGROUND_ASSET_MISSING',
  IMAGE_BACKGROUND_ASSET_MISSING: 'IMAGE_BACKGROUND_ASSET_MISSING',
  BACKGROUND_ASSET_MISSING: 'BACKGROUND_ASSET_MISSING',
  BACKGROUND_ASSET_IDENTITY_MISMATCH: 'BACKGROUND_ASSET_IDENTITY_MISMATCH',
  BACKGROUND_LOCKED: 'DENIED_BACKGROUND_LOCKED',
  BACKGROUND_STATE_NOT_RESOLVED: 'BACKGROUND_NOT_RESOLVED',
  BACKGROUND_STATE_REVISION_MISMATCH: 'BACKGROUND_STATE_REVISION_MISMATCH',
  PREVIEW_BACKGROUND_STATE_MISMATCH: 'PREVIEW_BACKGROUND_STATE_MISMATCH',
});

export const canvasForRatio = (ratio = '9:16') => {
  if (ratio === '9:16') return {width:1080, height:1920};
  if (ratio === '16:9') return {width:1920, height:1080};
  if (ratio === '1:1') return {width:1080, height:1080};
  throw new Error(`Unsupported ratio: ${ratio}`);
};

export const previewCanvasForRatio = (ratio = '9:16') => {
  if (ratio === '9:16') return {width:720, height:1280};
  if (ratio === '16:9') return {width:1280, height:720};
  if (ratio === '1:1') return {width:720, height:720};
  throw new Error(`Unsupported ratio: ${ratio}`);
};

const loadRegistry = () => JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));

export const getBackgroundDefinition = (backgroundId, state = null) => {
  if (state?.selection?.backgroundUser?.id === backgroundId) {
    return clone(state.selection.backgroundUser);
  }
  const registry = loadRegistry();
  const found = registry.backgrounds.find((item) => item.id === backgroundId || item.aliases?.includes(backgroundId));
  if (!found) throw new Error(`${BACKGROUND_ERRORS.BACKGROUND_NOT_FOUND}:${backgroundId}`);
  if (!found.enabled) throw new Error(`${BACKGROUND_ERRORS.BACKGROUND_DISABLED}:${backgroundId}`);
  return {...found, canonicalId: found.id};
};

export const canonicalBackgroundId = (backgroundId, state = null) => {
  const def = getBackgroundDefinition(backgroundId, state);
  return def.canonicalId ?? def.id;
};

const sha256 = (filePath) => {
  const bytes = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(bytes).digest('hex');
};

export const assetIdentity = (filePath) => {
  const stat = fs.statSync(filePath);
  return {size:stat.size, hash:sha256(filePath)};
};

const imageDimensions = (filePath) => {
  const raw = execFileSync('ffprobe', [
    '-v','error', '-select_streams','v:0', '-show_entries','stream=width,height',
    '-of','json', filePath,
  ], {encoding:'utf8'});
  const parsed = JSON.parse(raw);
  const stream = parsed.streams?.[0];
  if (!stream?.width || !stream?.height) throw new Error(`IMAGE_METADATA_UNAVAILABLE:${filePath}`);
  return {width:Number(stream.width), height:Number(stream.height)};
};

export const calculateCoverCrop = (sourceWidth, sourceHeight, canvasWidth, canvasHeight, anchor = 'center') => {
  const sourceRatio = sourceWidth / sourceHeight;
  const canvasRatio = canvasWidth / canvasHeight;
  let cropWidth;
  let cropHeight;
  if (sourceRatio > canvasRatio) {
    cropHeight = sourceHeight;
    cropWidth = sourceHeight * canvasRatio;
  } else {
    cropWidth = sourceWidth;
    cropHeight = sourceWidth / canvasRatio;
  }
  const x = (sourceWidth - cropWidth) / 2;
  let y = (sourceHeight - cropHeight) / 2;
  if (anchor === 'top') y = 0;
  if (anchor === 'bottom') y = sourceHeight - cropHeight;
  return {x, y, width:cropWidth, height:cropHeight};
};

export const createUserBackgroundDefinition = ({state, sourcePath, anchor = 'center', projectRoot = PROJECT_ROOT}) => {
  if (!['top','center','bottom'].includes(anchor)) throw new Error('Image anchor must be top, center, or bottom.');
  const absoluteSource = path.resolve(sourcePath);
  if (!fs.existsSync(absoluteSource)) throw new Error(`${BACKGROUND_ERRORS.IMAGE_BACKGROUND_ASSET_MISSING}:${absoluteSource}`);
  const safeJobId = String(state.jobId ?? 'job').replace(/[^a-zA-Z0-9_-]/g, '_');
  const publicRelativePath = path.posix.join('runtime-backgrounds', safeJobId, 'background.png');
  const normalizedPath = path.join(projectRoot, 'public', ...publicRelativePath.split('/'));
  fs.mkdirSync(path.dirname(normalizedPath), {recursive:true});
  execFileSync('ffmpeg', [
    '-y','-loglevel','error','-i',absoluteSource,'-frames:v','1','-vf','format=rgb24',normalizedPath,
  ], {stdio:'inherit'});
  const dims = imageDimensions(normalizedPath);
  return {
    id:`BG-USER-${safeJobId}`,
    type:'image',
    name:'Uploaded Image',
    source:'user',
    originalPath:absoluteSource,
    asset:normalizedPath,
    publicRelativePath,
    defaultAnchor:anchor,
    width:dims.width,
    height:dims.height,
    enabled:true,
  };
};

export const resolveBackgroundState = (inputState, {projectRoot = PROJECT_ROOT} = {}) => {
  const state = clone(inputState);
  const revision = Number(state.visual?.revision ?? 1);
  const backgroundRevision = Number(state.visual?.backgroundRevision ?? revision);
  const selectedId = state.selection?.background;
  if (!selectedId) throw new Error(`${BACKGROUND_ERRORS.BACKGROUND_NOT_FOUND}:<empty>`);
  const def = getBackgroundDefinition(selectedId, state);
  const canonicalId = def.canonicalId ?? def.id;
  const canvas = canvasForRatio(state.input?.ratio ?? '9:16');
  const appearance = {opacity:1, blur:0, brightness:1};
  let renderState;

  if (def.type === 'solid') {
    if (!def.color) throw new Error(BACKGROUND_ERRORS.SOLID_BACKGROUND_COLOR_MISSING);
    renderState = {
      schemaVersion:1,
      id:id('BGSTATE'),
      sourceVisualRevision:revision,
      sourceBackgroundRevision:backgroundRevision,
      backgroundId:canonicalId,
      selectedBackgroundId:selectedId,
      type:'solid',
      canvas,
      source:{color:def.color},
      appearance,
      transformVersion:1,
      status:'resolved',
    };
  } else {
    const assetPath = path.resolve(projectRoot, def.asset ?? '');
    const resolvedAsset = path.isAbsolute(def.asset ?? '') ? def.asset : assetPath;
    if (!resolvedAsset || !fs.existsSync(resolvedAsset)) {
      throw new Error(def.type === 'paper' ? BACKGROUND_ERRORS.PAPER_BACKGROUND_ASSET_MISSING : BACKGROUND_ERRORS.IMAGE_BACKGROUND_ASSET_MISSING);
    }
    const dims = def.width && def.height ? {width:def.width, height:def.height} : imageDimensions(resolvedAsset);
    renderState = {
      schemaVersion:1,
      id:id('BGSTATE'),
      sourceVisualRevision:revision,
      sourceBackgroundRevision:backgroundRevision,
      backgroundId:canonicalId,
      selectedBackgroundId:selectedId,
      type:def.type,
      canvas,
      source:{
        asset:resolvedAsset,
        publicRelativePath:def.publicRelativePath ?? null,
        width:dims.width,
        height:dims.height,
        assetIdentity:assetIdentity(resolvedAsset),
      },
      appearance,
      transformVersion:1,
      status:'resolved',
      legacyT01Baseline:Boolean(def.legacyT01Baseline),
    };
    if (def.type === 'image') {
      const anchor = state.selection?.backgroundAnchor ?? def.defaultAnchor ?? 'center';
      renderState.transform = {
        fit:'cover',
        anchor,
        crop:calculateCoverCrop(dims.width, dims.height, canvas.width, canvas.height, anchor),
      };
    }
  }

  state.visual = state.visual ?? {};
  state.visual.backgroundRenderState = renderState;
  state.visual.backgroundRenderStateStatus = 'resolved';
  state.events = state.events ?? [];
  state.events.push({at:new Date().toISOString(), type:'background-resolved', backgroundId:canonicalId, backgroundRenderStateId:renderState.id, visualRevision:revision, backgroundRevision});
  return state;
};

export const invalidateBackgroundState = (inputState, reason = 'visual-change') => {
  const state = clone(inputState);
  if (state.visual?.backgroundRenderState) state.visual.backgroundRenderState.status = 'invalid';
  if (state.visual) state.visual.backgroundRenderStateStatus = 'invalid';
  state.events = state.events ?? [];
  state.events.push({at:new Date().toISOString(), type:'background-render-state-invalidated', reason});
  return state;
};

export const validateBackgroundStateForPreview = (state) => {
  const bg = state.visual?.backgroundRenderState;
  if (!bg || bg.status !== 'resolved') throw new Error(BACKGROUND_ERRORS.BACKGROUND_STATE_NOT_RESOLVED);
  if (Number(bg.sourceBackgroundRevision ?? bg.sourceVisualRevision) !== Number(state.visual?.backgroundRevision ?? state.visual?.revision ?? 1)) {
    throw new Error(BACKGROUND_ERRORS.BACKGROUND_STATE_REVISION_MISMATCH);
  }
  return bg;
};

export const validateBackgroundAsset = (bg) => {
  if (!bg || bg.status !== 'resolved') throw new Error(BACKGROUND_ERRORS.BACKGROUND_STATE_NOT_RESOLVED);
  if (bg.type === 'solid') return true;
  const asset = bg.source?.asset;
  if (!asset || !fs.existsSync(asset)) throw new Error(BACKGROUND_ERRORS.BACKGROUND_ASSET_MISSING);
  const expected = bg.source?.assetIdentity;
  if (expected) {
    const actual = assetIdentity(asset);
    if (expected.size !== actual.size || expected.hash !== actual.hash) {
      throw new Error(BACKGROUND_ERRORS.BACKGROUND_ASSET_IDENTITY_MISMATCH);
    }
  }
  return true;
};

export const writeBackgroundSidecars = (state) => {
  const writeJson = (p, data) => {
    if (!p || !data) return;
    fs.mkdirSync(path.dirname(path.resolve(p)), {recursive:true});
    fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
  };
  writeJson(state.assets?.draftVisualConfigPath, state.visual?.draftVisualConfig);
  writeJson(state.assets?.backgroundRenderStatePath, state.visual?.backgroundRenderState);
  writeJson(state.assets?.previewStatePath, state.visual?.previewState);
  writeJson(state.assets?.visualLockStatePath, state.visual?.productionVisualLock);
  writeJson(state.assets?.renderManifestPath, state.visual?.renderManifest);
};
