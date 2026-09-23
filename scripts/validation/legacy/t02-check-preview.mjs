import fs from 'node:fs';
import assert from 'node:assert/strict';
import {layout as L} from '../../../src/templates/t02-paper-dialogue/layout.mjs';
import {animation as A} from '../../../src/templates/t02-paper-dialogue/animation.mjs';
import {phraseEnds,prepare} from '../../../src/templates/t02-paper-dialogue/model.mjs';
import {requirePreviewTemplate} from '../../../src/templates/registry.mjs';
import {beginPartRender,readState} from '../../lib/workflow-state.mjs';
const report={};
for(const language of ['en','zh']) {
 const base=`validation/t02-preview/${language}`;
 const timeline=JSON.parse(fs.readFileSync(`${base}/timeline.json`));
 const evidence=JSON.parse(fs.readFileSync(`${base}/render-evidence.json`));
 const baseline=JSON.parse(fs.readFileSync(`validation/t02-fade-zone-baseline/${language}-render-evidence-before.json`));
 const hashes=JSON.parse(fs.readFileSync(`${base}/raw-frame-hashes.json`));
 assert.equal(Object.keys(evidence).length,timeline.durationInFrames,'Every rendered frame must have layout evidence');
 const frames=Object.values(evidence).sort((a,b)=>a.rawFrame-b.rawFrame);
 let capped=0,flow=0,fadeZoneFrames=0,fit=0,stableRuns=0;const last=new Map();
 const invariantState=(s)=>({
  rawFrame:s.rawFrame,frame:s.frame,cardHeight:s.cardHeight,cardTop:s.cardTop,
  contentHeight:s.contentHeight,overflow:s.overflow,glyphWidths:s.glyphWidths,dom:s.dom,
  blocks:s.blocks.map(({opacity,...block})=>block),
 });
 for(const s of frames) {
  assert.deepEqual(invariantState(s),invariantState(baseline[s.rawFrame]),`Non-fade state changed at ${language} frame ${s.rawFrame}`);
  assert(s.cardTop>=L.safeTop-0.01);assert(s.cardTop+s.cardHeight<=L.safeBottom+0.01);
  if(s.cardHeight===L.safeBottom-L.safeTop)capped++;
  if(s.overflow>0.001){flow++;assert.equal(s.cardTop,L.safeTop);assert.equal(s.cardHeight,L.safeBottom-L.safeTop);}
  assert.equal(s.fadeOutZone.active,s.overflow>0);
  assert.equal(s.fadeOutZone.height,A.fadeOutZoneHeight);
  if(s.overflow>0)assert.match(s.fadeOutZone.maskImage,/linear-gradient/);
  else assert.equal(s.fadeOutZone.maskImage,'none');
  assert.deepEqual(Object.values(s.glyphWidths),[34,34,34,34]);
  for(let i=0;i<s.blocks.length;i++) {
   const b=s.blocks[i],dom=s.dom.find(d=>d.id===b.id);
   assert.equal(b.opacity,1,'Block opacity must stay neutral; the fixed zone owns fade-out');
   assert.equal(dom.fill,b.user?'rgb(72, 71, 68)':'rgb(238, 234, 226)');
   assert(b.width<=(b.user?L.userMaxWidth:L.aiMaxWidth)+0.01);
   if(i)assert(b.y>=s.blocks[i-1].y+s.blocks[i-1].height+L.gap-0.01,'No stack overlap');
   if(!b.user&&b.lines.length===1&&b.shown>0){assert(Math.abs(b.width-(dom.lines[0].width+2*L.padX))<0.1,'Real rendered text width plus padding');fit++;}
   if(b.user)assert.equal(b.shown,b.text.length,'User text appears in full');
   else if(b.shown>0)assert(phraseEnds(b.text).includes(b.shown),'Only phrase boundaries may reveal');
   const prev=last.get(b.id);
   if(prev){assert(b.shown>=prev.shown,'Streaming only appends');for(let j=0;j<prev.lines.length;j++){assert(b.lines[j].startsWith(prev.lines[j]),'Previously shown line must stay a prefix');assert.equal(dom.lines[j].x,prev.dom.lines[j].x,'No horizontal text jump');stableRuns++;}}
   if(s.overflow>0&&b.screenY<A.fadeOutZoneHeight&&b.screenY+b.height>0)fadeZoneFrames++;
   last.set(b.id,{...b,dom});
  }
 }
 assert(capped>0&&flow>0&&fadeZoneFrames>0&&fit>0);
 const tail=frames.slice(-24);const frozen=tail.map(({rawFrame,...s})=>JSON.stringify(s));assert.equal(new Set(frozen).size,1,'All visual state freezes');
 assert.equal(new Set(Object.values(hashes).slice(-24)).size,1,'Original PNG frames freeze');
 const segments=JSON.parse(fs.readFileSync(`${base}/segments.json`));
 for(const p of segments.parts)assert(p.durationInFrames>=72&&p.durationInFrames<=192);
 const state=readState(`${base}/job.json`);assert.notEqual(state.preview.global.status,'approved');assert.throws(()=>beginPartRender(state,1),/approved preview/);
 assert.throws(()=>prepare({...timeline,ratio:'1:1'},t=>t.length*34),/9X16_ONLY/);
 report[language]={frames:frames.length,cappedFrames:capped,flowFrames:flow,
  fadeOutZoneHeight:A.fadeOutZoneHeight,fadeZoneIntersectionSamples:fadeZoneFrames,
  nonFadeFrameStateIdenticalToReviewedCandidate:true,blockOpacityAlwaysOne:true,
  contentFitSamples:fit,stableLineComparisons:stableRuns,glyphWidths:frames[0].glyphWidths,
  rawFinal24Identical:true,previewGate:'unapproved; formal render rejected',parts:segments.parts.length};
}
assert.throws(()=>requirePreviewTemplate('t02-paper-dialogue','16:9'),/not enabled/);
fs.writeFileSync('validation/t02-preview/check-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
