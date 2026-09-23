import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {compileTimeline} from '../../lib/timeline-compiler.mjs';
import {segmentTimeline} from '../../lib/timeline-segmenter.mjs';
import {makeWorkflowState,selectTemplate} from '../../lib/workflow-state.mjs';
import {applyTemplateTimingToState,T02_INTRO_DELAY_FRAMES,templateTimingOffsetFrames} from '../../lib/template-timing.mjs';
import {requireProductionTemplate} from '../../../src/templates/registry.mjs';
import {canvasForRatio,previewCanvasForRatio} from '../../lib/background-system.mjs';

for (const ratio of ['9:16','1:1','16:9']) {
  assert.equal(requireProductionTemplate('t02-paper-dialogue', ratio).id, 't02-paper-dialogue');
  assert.equal(requireProductionTemplate('t02-paper-dialogue', ratio,{allowCandidate:true}).id, 't02-paper-dialogue');
  const native=canvasForRatio(ratio),preview=previewCanvasForRatio(ratio);
  assert.equal(preview.width/native.width, preview.height/native.height, `${ratio} preview scale must be uniform`);
  assert.equal(preview.width/native.width, 2/3, `${ratio} preview scale must be 2/3`);
}
assert.equal(templateTimingOffsetFrames('t02-paper-dialogue','9:16'),0);
assert.equal(templateTimingOffsetFrames('t02-paper-dialogue','1:1'),T02_INTRO_DELAY_FRAMES);
assert.equal(templateTimingOffsetFrames('t02-paper-dialogue','16:9'),T02_INTRO_DELAY_FRAMES);
assert.equal(templateTimingOffsetFrames('t01-reference-research-console','16:9'),0);

const messages=[
  {id:'m1',speaker:'user',text:'测试开场。'},
  {id:'m2',speaker:'assistant',text:'这是一个生产路由测试。'},
];
for (const ratio of ['1:1','16:9']) {
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'t02-routing-'));
  const timelinePath=path.join(tmp,'timeline.json');
  const segmentsPath=path.join(tmp,'segments.json');
  const original=compileTimeline(messages,{ratio});
  const manifest=segmentTimeline(original);
  fs.writeFileSync(timelinePath,JSON.stringify(original));
  fs.writeFileSync(segmentsPath,JSON.stringify(manifest));
  let state=makeWorkflowState({jobId:'test',dialoguePath:path.join(tmp,'dialogue.txt'),timelinePath,segmentsPath,ratio,manifest});
  state=selectTemplate(state,'t02-paper-dialogue');
  state=applyTemplateTimingToState(state,'t02-paper-dialogue');
  let shifted=JSON.parse(fs.readFileSync(timelinePath,'utf8'));
  assert.equal(shifted.messages[0].startFrame,T02_INTRO_DELAY_FRAMES);
  assert.equal(shifted.messages[1].typingStartFrame,original.messages[1].typingStartFrame+T02_INTRO_DELAY_FRAMES);
  assert.equal(shifted.messages[1].revealStartFrame,original.messages[1].revealStartFrame+T02_INTRO_DELAY_FRAMES);
  assert.equal(shifted.durationInFrames,original.durationInFrames+T02_INTRO_DELAY_FRAMES);
  assert.equal(state.parts.at(-1).globalEndFrameExclusive,shifted.durationInFrames);
  state=selectTemplate(state,'t01-reference-research-console');
  state=applyTemplateTimingToState(state,'t01-reference-research-console');
  const restored=JSON.parse(fs.readFileSync(timelinePath,'utf8'));
  assert.equal(restored.messages[0].startFrame,0);
  assert.equal(restored.durationInFrames,original.durationInFrames);
  fs.rmSync(tmp,{recursive:true,force:true});
}

const renderJob=fs.readFileSync(new URL('../../cli/render-job.mjs',import.meta.url),'utf8');
assert.match(renderJob,/requireProductionTemplate\(template, ratio, \{allowCandidate:validationCandidate\}\)/);
assert.match(renderJob,/argv\.includes\('--validation-candidate'\)/);
assert.match(renderJob,/\$\{template\} formal render requires the Remotion engine/);
assert.match(renderJob,/timeline: \['t02-paper-dialogue','t03-keyflow'\]\.includes\(template\) \? \{\.\.\.timeline, template\} : timeline/);

console.log('T02 production routing + template timing checks: PASS');
