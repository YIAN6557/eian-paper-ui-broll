import assert from 'node:assert/strict';
import {
  makeWorkflowState, selectTemplate, selectBackground, markPreviewReady,
  approvePreview, beginPartRender, completePartRender,
} from '../../lib/workflow-state.mjs';
import {calculateCoverCrop, resolveBackgroundState} from '../../lib/background-system.mjs';

const manifest = {parts:[
  {part:1,globalStartFrame:0,globalEndFrameExclusive:120,durationInFrames:120,durationSeconds:5,startsWithCarryOver:false,isFinal:false,cutReason:'test'},
  {part:2,globalStartFrame:120,globalEndFrameExclusive:220,durationInFrames:100,durationSeconds:4.167,startsWithCarryOver:true,isFinal:true,cutReason:'test'},
]};

const crop = calculateCoverCrop(3024,4032,1080,1920,'center');
assert.deepEqual(crop,{x:378,y:0,width:2268,height:4032});

let s = makeWorkflowState({jobId:'stage3-test',dialoguePath:'d.txt',timelinePath:'t.json',segmentsPath:'s.json',manifest});
s = selectTemplate(s,'t01-reference-research-console');
s = selectBackground(s,'BG-S01');
s = resolveBackgroundState(s);
s = markPreviewReady(s,{path:'preview.png'});
s = approvePreview(s);
const lockedBg = s.locks.backgroundLockedStateId;
assert.ok(lockedBg);
assert.throws(() => selectBackground(s,'BG-P02'), /DENIED_BACKGROUND_LOCKED/);

s = beginPartRender(s,1);
s = completePartRender(s,1,'part-01.mp4');
s = selectTemplate(s,'t02-placeholder',{part:2});
assert.equal(s.locks.backgroundLockedStateId,lockedBg);
assert.equal(s.locks.continuityGuarantee,false);
assert.equal(s.visual.productionVisualLock.background.backgroundRenderStateId,lockedBg);
assert.equal(s.visual.productionVisualLock.template.exception.used,true);
assert.ok(s.visual.renderManifest.parts.every((p) => p.backgroundRenderStateId === lockedBg));

console.log('stage3 background state/integration tests: PASS');
