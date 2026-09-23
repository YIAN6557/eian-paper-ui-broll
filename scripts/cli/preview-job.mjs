#!/usr/bin/env node
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readState, writeState, markPreviewReady, resolvedTemplateForPart, resolvedTemplateForUserVisiblePart} from '../lib/workflow-state.mjs';
import {resolveBackgroundState, validateBackgroundStateForPreview, previewCanvasForRatio, canvasForRatio} from '../lib/background-system.mjs';
import {chooseRepresentativeFrame} from '../lib/preview-frame.mjs';

import {requirePreviewTemplate} from '../../src/templates/registry.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const arg = (name, fallback = null) => { const i = argv.indexOf(name); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : fallback; };
const statePath = path.resolve(arg('--state', 'temp/job.json'));
const engine = arg('--engine', 'reference');
const partArg = arg('--part');
const partNumber = partArg == null ? null : Number(partArg);
const userVisiblePartArg = arg('--user-visible-part');
const userVisiblePartNumber = userVisiblePartArg == null ? null : Number(userVisiblePartArg);
if (partNumber !== null && userVisiblePartNumber !== null) throw new Error('Use either --part or --user-visible-part, not both.');
let state = readState(statePath);
if (!state.selection.template) throw new Error('Select a template before generating preview.');

const existingBg = state.visual?.backgroundRenderState;
const bgRevision = Number(state.visual?.backgroundRevision ?? state.visual?.revision ?? 1);
const existingRevision = Number(existingBg?.sourceBackgroundRevision ?? existingBg?.sourceVisualRevision ?? -1);
if (!existingBg || existingBg.status !== 'resolved' || existingRevision !== bgRevision) {
  state = resolveBackgroundState(state);
  state = writeState(statePath, state);
}
const backgroundRenderState = validateBackgroundStateForPreview(state);

const timeline = JSON.parse(fs.readFileSync(state.assets.timelinePath, 'utf8'));
let start = 0;
let end = timeline.durationInFrames;
if (partNumber !== null) {
  const p = state.parts.find((x) => x.part === partNumber);
  if (!p) throw new Error(`Unknown part: ${partNumber}`);
  start = p.globalStartFrame;
  end = p.globalEndFrameExclusive;
}
if (userVisiblePartNumber !== null) {
  const p = (state.userVisibleParts ?? []).find((x) => Number(x.index) === userVisiblePartNumber);
  if (!p) throw new Error(`Unknown user-visible Part: ${userVisiblePartNumber}`);
  start = p.timelineStart;
  end = p.timelineEnd;
}
const template = userVisiblePartNumber !== null ? resolvedTemplateForUserVisiblePart(state, userVisiblePartNumber) : (partNumber === null ? state.selection.template : resolvedTemplateForPart(state, partNumber));
requirePreviewTemplate(template, timeline.ratio ?? '9:16');
if (['t02-paper-dialogue','t03-keyflow'].includes(template) && engine !== 'remotion') throw new Error(`${template} preview requires the formal Remotion engine.`);
const suffix = userVisiblePartNumber !== null ? `part-${String(userVisiblePartNumber).padStart(2,'0')}-exception-preview` : (partNumber === null ? 'preview' : `part-${String(partNumber).padStart(2,'0')}-preview`);
const outputPath = path.resolve(arg('--output', path.join(state.assets.outputDir, `${state.input.outputBaseName}-${suffix}.png`)));
fs.mkdirSync(path.dirname(outputPath), {recursive:true});
const globalFrame = chooseRepresentativeFrame(timeline, start, end);

if (engine === 'reference') {
  const discardVideo = path.join(path.dirname(outputPath), `.preview-discard-${process.pid}.mp4`);
  const framesDir = path.join(path.dirname(outputPath), `.preview-frames-${process.pid}`);
  execFileSync('python', [
    'dev/reference_renderer.py', '--timeline', state.assets.timelinePath,
    '--preview', outputPath, '--video', discardVideo, '--frames-dir', framesDir,
    '--start-frame', String(globalFrame), '--end-frame', String(globalFrame + 1),
    '--background-state', state.assets.backgroundRenderStatePath,
  ], {cwd: projectRoot, stdio:'inherit'});
  fs.rmSync(discardVideo, {force:true});
  fs.rmSync(framesDir, {recursive:true, force:true});
} else if (engine === 'remotion') {
  const props = JSON.stringify({
    timeline: ['t02-paper-dialogue','t03-keyflow'].includes(template) ? {...timeline, template} : timeline,
    globalStartFrame: globalFrame,
    globalEndFrameExclusive: globalFrame + 1,
    backgroundRenderState,
  });
  const ratio = state.input?.ratio ?? timeline.ratio ?? '9:16';
  const previewSize = previewCanvasForRatio(ratio);
  const nativeSize = canvasForRatio(ratio);
  const scaleX = previewSize.width / nativeSize.width;
  const scaleY = previewSize.height / nativeSize.height;
  if (Math.abs(scaleX - scaleY) > 1e-9) throw new Error(`Preview scale mismatch for ${ratio}: ${scaleX} vs ${scaleY}`);
  execFileSync('npx', ['remotion','still','src/index.tsx','PaperUI',outputPath,'--frame','0',...(template === 't02-paper-dialogue' ? ['--scale',String(scaleX)] : ['--width',String(previewSize.width),'--height',String(previewSize.height)]),'--props',props], {stdio:'inherit'});
} else {
  throw new Error(`Unknown engine: ${engine}`);
}

state = markPreviewReady(state, {path: outputPath, part: partNumber, userVisiblePart: userVisiblePartNumber});
writeState(statePath, state);
console.log(outputPath);
