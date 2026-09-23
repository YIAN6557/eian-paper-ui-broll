#!/usr/bin/env node
import assert from 'node:assert/strict';
import {canvasForRatio, previewCanvasForRatio, resolveBackgroundState, calculateCoverCrop} from '../../lib/background-system.mjs';
import {makeWorkflowState, selectTemplate, markPreviewReady} from '../../lib/workflow-state.mjs';

const dims = {
  '9:16': {canvas:{width:1080,height:1920}, preview:{width:720,height:1280}},
  '1:1': {canvas:{width:1080,height:1080}, preview:{width:720,height:720}},
  '16:9': {canvas:{width:1920,height:1080}, preview:{width:1280,height:720}},
};

const manifest = {parts:[{part:1,globalStartFrame:0,globalEndFrameExclusive:120,durationInFrames:120,durationSeconds:5,startsWithCarryOver:false,isFinal:true,cutReason:'test'}]};

for (const [ratio, expected] of Object.entries(dims)) {
  assert.deepEqual(canvasForRatio(ratio), expected.canvas, `${ratio} production canvas`);
  assert.deepEqual(previewCanvasForRatio(ratio), expected.preview, `${ratio} preview canvas`);

  let state = makeWorkflowState({
    jobId:`ratio-${ratio.replace(':','x')}`,
    dialoguePath:'dialogue.txt',
    timelinePath:'timeline.json',
    segmentsPath:'segments.json',
    ratio,
    manifest,
  });
  state = selectTemplate(state, 't01-reference-research-console');
  state.selection.background = 'BG-S01';
  state = resolveBackgroundState(state);
  assert.deepEqual(state.visual.backgroundRenderState.canvas, expected.canvas, `${ratio} background render canvas`);
  state = markPreviewReady(state, {path:`${ratio}.png`});
  assert.deepEqual(state.visual.previewState.resolution, expected.preview, `${ratio} preview state resolution`);
}


assert.deepEqual(calculateCoverCrop(3024,4032,1080,1080,'center'), {x:0,y:504,width:3024,height:3024});
assert.deepEqual(calculateCoverCrop(3024,4032,1920,1080,'center'), {x:0,y:1165.5,width:3024,height:1701});

// The single max-width cap must not affect the locked 9:16 or 1:1 width (84% of 1080 = 907.2).
const cappedCardWidth = (canvasWidth) => Math.min(canvasWidth * 0.84, 1180);
assert.ok(Math.abs(cappedCardWidth(1080) - 907.2) < 1e-9);
assert.equal(cappedCardWidth(1920), 1180);

console.log('stage4 ratio parameterization tests: PASS');
