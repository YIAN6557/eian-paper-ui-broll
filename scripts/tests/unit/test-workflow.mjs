import assert from 'node:assert/strict';
import {makeWorkflowState, selectTemplate, markPreviewReady, approvePreview, beginPartRender, completePartRender} from '../../lib/workflow-state.mjs';
import {resolveBackgroundState} from '../../lib/background-system.mjs';

const manifest = (count) => ({parts: Array.from({length:count}, (_,i)=>({part:i+1,globalStartFrame:i*100,globalEndFrameExclusive:(i+1)*100,durationInFrames:100,durationSeconds:4.167,startsWithCarryOver:i>0,isFinal:i===count-1,cutReason:'test'}))});
const make = (count) => makeWorkflowState({jobId:'test',dialoguePath:'d.txt',timelinePath:'t.json',segmentsPath:'s.json',manifest:manifest(count)});
const withBackground = (state) => resolveBackgroundState(state);

// Before formal render: template can change and preview is invalidated.
let s = make(3);
s = selectTemplate(s, 't01');
s = withBackground(s);
s = markPreviewReady(s, {path:'preview.png'});
s = approvePreview(s);
s = selectTemplate(s, 't01-revised-before-render');
assert.equal(s.selection.template, 't01-revised-before-render');
assert.equal(s.preview.global.status, 'not_generated');
assert.equal(s.locks.templateLocked, false);

// Once formal render begins, template is locked.
s = markPreviewReady(s, {path:'preview2.png'});
s = approvePreview(s);
s = beginPartRender(s, 1);
assert.equal(s.locks.templateLocked, true);
assert.throws(() => selectTemplate(s, 't02'), /Template is locked/);

// Exact two-part exception: Part 1 completed, Part 2 not formally started.
let t = make(2);
t = selectTemplate(t, 't01');
t = withBackground(t);
t = markPreviewReady(t, {path:'preview.png'});
t = approvePreview(t);
t = beginPartRender(t, 1);
t = completePartRender(t, 1, 'part-01.mp4');
t = selectTemplate(t, 't02', {part:2});
assert.equal(t.locks.partTemplateOverrides['2'], 't02');
assert.equal(t.locks.continuityGuarantee, false);
assert.equal(t.preview.parts['2'].status, 'not_generated');

// Exception disappears the moment Part 2 formal render starts.
t = markPreviewReady(t, {path:'part2-preview.png', part:2});
t = approvePreview(t, {part:2});
t = beginPartRender(t, 2);
assert.throws(() => selectTemplate(t, 't03', {part:2}), /Template is locked/);

// Three-part jobs never get the exception even if Part 1 is done and Part 2 is pending.
let u = make(3);
u = selectTemplate(u, 't01');
u = withBackground(u);
u = markPreviewReady(u, {path:'preview.png'});
u = approvePreview(u);
u = beginPartRender(u, 1);
u = completePartRender(u, 1, 'part-01.mp4');
assert.throws(() => selectTemplate(u, 't02', {part:2}), /Template is locked/);

console.log('workflow-state tests: PASS');
