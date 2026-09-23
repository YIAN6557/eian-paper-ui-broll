#!/usr/bin/env node
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readState, writeState, beginPartRender, beginUserVisiblePartRender, completePartRender, completeUserVisiblePartRender, failPartRender, failUserVisiblePartRender, resolvedTemplateForPart, resolvedTemplateForUserVisiblePart, workflowSummary} from '../lib/workflow-state.mjs';
import {validateBackgroundAsset} from '../lib/background-system.mjs';
import {requireProductionTemplate} from '../../src/templates/registry.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const arg = (name, fallback = null) => { const i = argv.indexOf(name); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : fallback; };
const statePath = path.resolve(arg('--state', 'temp/job.json'));
const engine = arg('--engine', 'reference');
const mode = arg('--mode', 'all');
const validationCandidate = argv.includes('--validation-candidate');
const userVisiblePartArg = arg('--user-visible-part');
const userVisiblePartNumber = userVisiblePartArg === null ? null : Number(userVisiblePartArg);
const requestedOutputPath = arg('--output');
const widthArg = arg('--width');
const heightArg = arg('--height');
if ((widthArg === null) !== (heightArg === null)) throw new Error('--width and --height must be provided together.');
const outputDimensionArgs = widthArg === null ? [] : (() => {
  const width = Number(widthArg);
  const height = Number(heightArg);
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) throw new Error('--width and --height must be positive integers.');
  return ['--width', String(width), '--height', String(height)];
})();
let state = readState(statePath);
const timeline = JSON.parse(fs.readFileSync(state.assets.timelinePath, 'utf8'));

// Task 09 adds a narrow formal-delivery adapter: one full user-visible Part is
// still rendered by this canonical renderer from its existing global timeline.
// The legacy internal-part loop below remains unchanged for legacy callers.
if (userVisiblePartNumber !== null) {
  if (!Number.isInteger(userVisiblePartNumber) || userVisiblePartNumber < 1) throw new Error('--user-visible-part must be a positive integer.');
  if (!requestedOutputPath) throw new Error('--output is required with --user-visible-part.');
  const userVisiblePart = (state.userVisibleParts ?? []).find((part) => Number(part.index) === userVisiblePartNumber);
  if (!userVisiblePart) throw new Error(`Unknown user-visible Part: ${userVisiblePartNumber}`);
  const template = resolvedTemplateForUserVisiblePart(state, userVisiblePartNumber);
  const ratio = state.input?.ratio ?? timeline.ratio ?? '9:16';
  requireProductionTemplate(template, ratio, {allowCandidate:validationCandidate});
  if (['t02-paper-dialogue','t03-keyflow'].includes(template) && engine !== 'remotion') throw new Error(`${template} formal render requires the Remotion engine.`);
  const outputPath = path.resolve(requestedOutputPath);
  const label = `user-visible-part-${String(userVisiblePartNumber).padStart(2,'0')}`;
  const previewDiscard = path.join(path.dirname(outputPath), `.render-preview-discard-${label}.png`);
  const framesDir = path.join(path.dirname(outputPath), `.frames-${label}`);
  fs.mkdirSync(path.dirname(outputPath), {recursive:true});
  try {
    state = beginUserVisiblePartRender(state, userVisiblePartNumber);
    state = writeState(statePath, state); // Locks and manifest are persisted before the renderer starts.
    const manifest = state.visual?.renderManifest;
    if (!manifest) throw new Error('RENDER_MANIFEST_MISSING');
    for (const part of manifest.parts) {
      if (part.backgroundRenderStateId !== manifest.backgroundRenderStateId) throw new Error(`CONTINUITY_BACKGROUND_STATE_MISMATCH:PART_${part.partNumber}`);
      if (part.visualLockStateId !== manifest.visualLockStateId) throw new Error(`CONTINUITY_VISUAL_LOCK_MISMATCH:PART_${part.partNumber}`);
    }
    validateBackgroundAsset(state.visual.backgroundRenderState);
    if (engine === 'reference') {
      execFileSync('python', [
        'dev/reference_renderer.py', '--timeline', state.assets.timelinePath,
        '--preview', previewDiscard, '--video', outputPath, '--frames-dir', framesDir,
        '--start-frame', String(userVisiblePart.timelineStart), '--end-frame', String(userVisiblePart.timelineEnd),
        '--background-state', state.assets.backgroundRenderStatePath,
      ], {cwd: projectRoot, stdio:'inherit'});
      fs.rmSync(previewDiscard, {force:true});
      fs.rmSync(framesDir, {recursive:true, force:true});
    } else if (engine === 'remotion') {
      const props = JSON.stringify({
        timeline: ['t02-paper-dialogue','t03-keyflow'].includes(template) ? {...timeline, template} : timeline,
        globalStartFrame:userVisiblePart.timelineStart,
        globalEndFrameExclusive:userVisiblePart.timelineEnd,
        backgroundRenderState:state.visual.backgroundRenderState,
      });
      execFileSync('npx', ['remotion','render','src/index.tsx','PaperUI',outputPath,'--codec','h264','--crf','18',...outputDimensionArgs,'--props',props], {stdio:'inherit'});
    } else {
      throw new Error(`Unknown engine: ${engine}`);
    }
    state = completeUserVisiblePartRender(state, userVisiblePartNumber, outputPath);
    state = writeState(statePath, state);
  } catch (err) {
    const logsDir = state.assets.logsDir ? path.resolve(state.assets.logsDir) : path.join(path.dirname(statePath), 'logs');
    fs.mkdirSync(logsDir, {recursive:true});
    const logPath = path.join(logsDir, `render-error-${label}.log`);
    fs.writeFileSync(logPath, `${new Date().toISOString()}\n${err?.stack ?? err?.message ?? String(err)}\n`);
    state = failUserVisiblePartRender(state, userVisiblePartNumber, err?.message ?? String(err));
    state.events.push({at:new Date().toISOString(), type:'render-error-log-written', userVisiblePart:userVisiblePartNumber, path:logPath});
    writeState(statePath, state);
    throw err;
  }
  console.log(JSON.stringify(workflowSummary(state), null, 2));
  process.exit(0);
}

const pending = state.parts.filter((p) => p.status !== 'completed');
if (!pending.length) {
  console.log(JSON.stringify(workflowSummary(state), null, 2));
  process.exit(0);
}
const renderParts = mode === 'next' ? [pending[0]] : pending;
if (!['next','all'].includes(mode)) throw new Error('--mode must be next or all');

const validateContinuity = (s) => {
  const manifest = s.visual?.renderManifest;
  if (!manifest) throw new Error('RENDER_MANIFEST_MISSING');
  const expected = manifest.backgroundRenderStateId;
  for (const part of manifest.parts) {
    if (part.backgroundRenderStateId !== expected) throw new Error(`CONTINUITY_BACKGROUND_STATE_MISMATCH:PART_${part.partNumber}`);
    if (part.visualLockStateId !== manifest.visualLockStateId) throw new Error(`CONTINUITY_VISUAL_LOCK_MISMATCH:PART_${part.partNumber}`);
  }
};

for (const p of renderParts) {
  const template = resolvedTemplateForPart(state, p.part);
  const ratio = state.input?.ratio ?? timeline.ratio ?? '9:16';
  requireProductionTemplate(template, ratio, {allowCandidate:validationCandidate});
  if (['t02-paper-dialogue','t03-keyflow'].includes(template) && engine !== 'remotion') throw new Error(`${template} formal render requires the Remotion engine.`);
  const multi = state.parts.length > 1;
  const fileName = multi ? `${state.input.outputBaseName}-part-${String(p.part).padStart(2,'0')}.mp4` : `${state.input.outputBaseName}.mp4`;
  const outputPath = path.join(state.assets.outputDir, fileName);
  const previewDiscard = path.join(state.assets.outputDir, `.render-preview-discard-${p.part}.png`);
  const framesDir = path.join(state.assets.outputDir, `.frames-part-${p.part}`);
  try {
    state = beginPartRender(state, p.part);
    state = writeState(statePath, state); // Locks and manifest are persisted before the renderer starts.
    validateContinuity(state);
    validateBackgroundAsset(state.visual.backgroundRenderState);

    if (engine === 'reference') {
      execFileSync('python', [
        'dev/reference_renderer.py', '--timeline', state.assets.timelinePath,
        '--preview', previewDiscard, '--video', outputPath, '--frames-dir', framesDir,
        '--start-frame', String(p.globalStartFrame), '--end-frame', String(p.globalEndFrameExclusive),
        '--background-state', state.assets.backgroundRenderStatePath,
      ], {cwd: projectRoot, stdio:'inherit'});
      fs.rmSync(previewDiscard, {force:true});
      fs.rmSync(framesDir, {recursive:true, force:true});
    } else if (engine === 'remotion') {
      const props = JSON.stringify({
        timeline: ['t02-paper-dialogue','t03-keyflow'].includes(template) ? {...timeline, template} : timeline,
        globalStartFrame:p.globalStartFrame,
        globalEndFrameExclusive:p.globalEndFrameExclusive,
        backgroundRenderState:state.visual.backgroundRenderState,
      });
      if (template === 't02-paper-dialogue' && validationCandidate) {
        const rawFramesDir = path.join(path.dirname(outputPath), `raw-frames-part-${p.part}`);
        fs.rmSync(rawFramesDir, {recursive:true, force:true});
        execFileSync('npx', ['remotion','render','src/index.tsx','PaperUI',rawFramesDir,'--sequence','--image-format','png','--image-sequence-pattern','frame-[frame].[ext]','--props',props], {stdio:'inherit'});
        execFileSync('ffmpeg', ['-y','-v','error','-pattern_type','glob','-framerate','24','-i',path.join(rawFramesDir,'frame-*.png'),'-map','0:v:0','-an','-c:v','libx264','-pix_fmt','yuv420p','-color_range','tv','-qp','18','-g','1','-bf','0','-movflags','+faststart',outputPath], {stdio:'inherit'});
      } else {
        execFileSync('npx', ['remotion','render','src/index.tsx','PaperUI',outputPath,'--codec','h264','--crf','18','--props',props], {stdio:'inherit'});
      }
    } else {
      throw new Error(`Unknown engine: ${engine}`);
    }
    state = completePartRender(state, p.part, path.resolve(outputPath));
    state = writeState(statePath, state);
  } catch (err) {
    const logsDir = state.assets.logsDir ? path.resolve(state.assets.logsDir) : path.join(path.dirname(statePath), 'logs');
    fs.mkdirSync(logsDir, {recursive:true});
    const logPath = path.join(logsDir, `render-error-part-${String(p.part).padStart(2,'0')}.log`);
    fs.writeFileSync(logPath, `${new Date().toISOString()}\n${err?.stack ?? err?.message ?? String(err)}\n`);
    state = failPartRender(state, p.part, err?.message ?? String(err));
    state.events.push({at:new Date().toISOString(), type:'render-error-log-written', part:p.part, path:logPath});
    writeState(statePath, state);
    throw err;
  }
}
console.log(JSON.stringify(workflowSummary(state), null, 2));
