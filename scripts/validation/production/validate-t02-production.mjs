#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const outRoot=path.join(root,'validation','t02-production-validation');
const manifestPath=path.join(root,'validation','t02-production-validation-manifest.json');
fs.rmSync(outRoot,{recursive:true,force:true});fs.mkdirSync(outRoot,{recursive:true});
const results=[];const add=(id,status,detail='')=>results.push({id,status,detail});
const sha256=(f)=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const run=(cmd,args,{allowFail=false,capture=false,env={}}={})=>{
  const r=spawnSync(cmd,args,{cwd:root,encoding:'utf8',stdio:capture?'pipe':'inherit',env:{...process.env,...env}});
  if(capture&&r.stdout)process.stdout.write(r.stdout);if(capture&&r.stderr)process.stderr.write(r.stderr);
  if(r.status!==0&&!allowFail)throw new Error(`${cmd} ${args.join(' ')} failed (${r.status})`);return r;
};
const writeManifest=(overall)=>{
  const summary={pass:results.filter(x=>x.status==='PASS').length,blocked:results.filter(x=>x.status==='BLOCKED').length,fail:results.filter(x=>x.status==='FAIL').length};
  fs.writeFileSync(manifestPath,JSON.stringify({schemaVersion:1,suite:'T02_PRODUCTION_VALIDATION',generatedAt:new Date().toISOString(),overall,results,summary},null,2)+'\n');
};
const probe=(file)=>{
  const r=spawnSync('ffprobe',['-v','error','-select_streams','v:0','-count_frames','-show_entries','stream=codec_name,pix_fmt,width,height,r_frame_rate,nb_read_frames','-of','json',file],{encoding:'utf8'});
  if(r.status!==0)throw new Error(`ffprobe failed: ${file}`);return JSON.parse(r.stdout).streams?.[0];
};
const expected={
  '9:16':{preview:[720,1280],video:[1080,1920],intro:0},
  '1:1':{preview:[720,720],video:[1080,1080],intro:8},
  '16:9':{preview:[1280,720],video:[1920,1080],intro:8},
};

// Static and state-machine regressions run even when the local Remotion runtime is unavailable.
for(const [id,script] of [
  ['T02-REG-PARSER','scripts/tests/unit/test-dialogue-parser.mjs'],
  ['T02-REG-SEGMENTATION','scripts/tests/unit/test-segmentation.mjs'],
  ['T02-REG-WORKFLOW','scripts/tests/unit/test-workflow.mjs'],
  ['T02-REG-BACKGROUND','scripts/tests/unit/test-stage3-background.mjs'],
  ['T02-REG-RATIOS','scripts/tests/unit/test-stage4-ratios.mjs'],
  ['T02-REG-USER-WIDTH','scripts/tests/unit/test-user-bubble-width.mjs'],
  ['T02-REG-FINAL-HOLD','scripts/tests/unit/test-final-hold.mjs'],
  ['T02-UNIT-FADE','scripts/tests/unit/test-t02-fade-out-zone.mjs'],
  ['T02-UNIT-PUNCTUATION','scripts/tests/unit/test-t02-line-break-punctuation.mjs'],
  ['T02-UNIT-PRODUCTION-ROUTING','scripts/tests/unit/test-t02-production-routing.mjs'],
]){
  try{run('node',[script]);add(id,'PASS');}catch(e){add(id,'FAIL',e.message);writeManifest('FAIL');process.exit(1);}
}

const doctor=run('node',['scripts/maintenance/doctor.mjs'],{allowFail:true,capture:true});
if(doctor.status!==0){
  add('T02-ENV','BLOCKED','Formal Remotion dependencies are unavailable. Run npm run gate:check; if it reports missing items, obtain explicit user consent before npm run gate:install -- --consent, then rerun this validator.');
  writeManifest('BLOCKED');
  console.log(`T02 production validation BLOCKED after static preflight. Manifest: ${manifestPath}`);process.exit(2);
}
add('T02-ENV','PASS','doctor passed');

// T01 protected pixel regression after enabling T02 production routing.
try{run('node',['scripts/validation/regression/t02-t01-regression.mjs','after']);add('T02-T01-PIXEL-REGRESSION','PASS','157 protected T01 frame hashes identical to the saved before set');}
catch(e){add('T02-T01-PIXEL-REGRESSION','FAIL',e.message);writeManifest('FAIL');process.exit(1);}

const validatePreview=(file,ratio)=>{
  const s=probe(file);const [w,h]=expected[ratio].preview;
  if(Number(s.width)!==w||Number(s.height)!==h)throw new Error(`${ratio} preview ${s.width}x${s.height}, expected ${w}x${h}`);
};
const validateVideo=(file,ratio)=>{
  const s=probe(file);const [w,h]=expected[ratio].video;
  if(s.codec_name!=='h264'||s.pix_fmt!=='yuv420p'||s.r_frame_rate!=='24/1'||Number(s.width)!==w||Number(s.height)!==h)
    throw new Error(`${ratio} video spec mismatch: ${JSON.stringify(s)}`);
  return s;
};
const validateRawTail=(statePath,job,ratio)=>{
  const state=JSON.parse(fs.readFileSync(statePath,'utf8'));const timeline=JSON.parse(fs.readFileSync(state.assets.timelinePath,'utf8'));
  const p=job.parts.at(-1);const count=p.globalEndFrameExclusive-p.globalStartFrame;if(count<24)throw new Error(`${ratio}: final part shorter than 24 frames`);
  const framesDir=path.join(path.dirname(statePath),'tail-raw');fs.mkdirSync(framesDir,{recursive:true});
  const props=JSON.stringify({timeline:{...timeline,template:'t02-paper-dialogue'},globalStartFrame:p.globalStartFrame,globalEndFrameExclusive:p.globalEndFrameExclusive,backgroundRenderState:state.visual.backgroundRenderState});
  run('npx',['remotion','render','src/index.tsx','PaperUI',framesDir,'--sequence','--image-format=png','--frames',`${count-24}-${count-1}`,'--props',props]);
  const frames=fs.readdirSync(framesDir).filter(x=>x.endsWith('.png')).sort();if(frames.length!==24)throw new Error(`${ratio}: expected 24 raw tail frames, got ${frames.length}`);
  const hashes=frames.map(f=>sha256(path.join(framesDir,f)));if(new Set(hashes).size!==1)throw new Error(`${ratio}: raw final 24 frames are not identical`);
  return {sha256:hashes[0],framesDir};
};
const validateDecodedTail=(file,ratio)=>{
  const s=validateVideo(file,ratio);const total=Number(s.nb_read_frames);if(!Number.isFinite(total)||total<24)throw new Error(`${ratio}: ffprobe frame count unavailable`);
  const dir=path.join(path.dirname(file),'.decoded-tail');fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(dir,{recursive:true});
  run('ffmpeg',['-hide_banner','-loglevel','error','-i',file,'-vf',`select=gte(n\\,${total-24})`,'-vsync','0',path.join(dir,'%03d.png')]);
  const frames=fs.readdirSync(dir).filter(x=>x.endsWith('.png')).sort();if(frames.length!==24)throw new Error(`${ratio}: expected 24 decoded tail frames, got ${frames.length}`);
  const hashes=frames.map(f=>sha256(path.join(dir,f)));if(new Set(hashes).size!==1)throw new Error(`${ratio}: decoded MP4 final 24 frames are not identical`);
  return {frames:total,sha256:hashes[0]};
};
const validateIntro=(statePath,ratio)=>{
  const state=JSON.parse(fs.readFileSync(statePath,'utf8'));const timeline=JSON.parse(fs.readFileSync(state.assets.timelinePath,'utf8'));
  const expectedOffset=expected[ratio].intro;const first=timeline.messages.find(m=>m.speaker==='user');
  if(Number(first?.startFrame??-1)!==expectedOffset)throw new Error(`${ratio}: first user starts at ${first?.startFrame}, expected ${expectedOffset}`);
  if(Number(timeline.meta?.templateTimingOffsetFrames??0)!==expectedOffset)throw new Error(`${ratio}: template timing marker mismatch`);
};
const renderCase=(ratio)=>{
  const dir=path.join(outRoot,`ratio-${ratio.replace(':','x')}`);fs.mkdirSync(dir,{recursive:true});const state=path.join(dir,'job.json');
  run('node',['scripts/cli/prepare-job.mjs','--input','examples/inputs/dialogue.input.txt','--state',state,'--name',`t02-${ratio.replace(':','x')}`,'--ratio',ratio,'--output-dir',path.join(dir,'output')]);
  run('node',['scripts/cli/workflow.mjs','select-template','--state',state,'--template','t02-paper-dialogue']);
  run('node',['scripts/cli/workflow.mjs','select-background','--state',state,'--background','BG-P01']);
  validateIntro(state,ratio);
  const preview=path.join(dir,'preview.png');run('node',['scripts/cli/preview-job.mjs','--state',state,'--engine','remotion','--output',preview]);validatePreview(preview,ratio);
  run('node',['scripts/cli/workflow.mjs','approve-preview','--state',state]);run('node',['scripts/cli/render-job.mjs','--state',state,'--engine','remotion','--mode','all','--validation-candidate']);
  const job=JSON.parse(fs.readFileSync(state,'utf8'));
  if(!job.locks.templateLocked||job.visual?.productionVisualLock?.template?.id!=='t02-paper-dialogue')throw new Error(`${ratio}: template lock missing`);
  if(!job.visual?.renderManifest?.parts?.every(p=>p.templateId==='t02-paper-dialogue'))throw new Error(`${ratio}: render manifest template mismatch`);
  for(const p of job.parts){if(p.status!=='completed'||!p.outputPath||!fs.existsSync(p.outputPath))throw new Error(`${ratio}: incomplete part ${p.part}`);validateVideo(p.outputPath,ratio);}
  const raw=validateRawTail(state,job,ratio);const decoded=validateDecodedTail(job.parts.at(-1).outputPath,ratio);
  return {state,job,preview,raw,decoded};
};

const rendered=[];
for(const ratio of ['9:16','1:1','16:9']){
  try{const r=renderCase(ratio);rendered.push([ratio,r]);add(`T02-${ratio.replace(':','X')}-PRODUCTION`,'PASS',`${r.job.parts.length} part(s), formal Remotion preview + H.264 yuv420p MP4; raw/decoded final 24 frames identical`);}
  catch(e){add(`T02-${ratio.replace(':','X')}-PRODUCTION`,'FAIL',e.message);writeManifest('FAIL');process.exit(1);}
}

// Multi-Part production continuity with a non-legacy image background.
try{
  const ratio='9:16',dir=path.join(outRoot,'multi-part');fs.mkdirSync(dir,{recursive:true});const state=path.join(dir,'job.json');
  run('node',['scripts/cli/prepare-job.mjs','--input','examples/inputs/dialogue.long.txt','--state',state,'--name','t02-multi-part','--ratio',ratio,'--output-dir',path.join(dir,'output')]);
  run('node',['scripts/cli/workflow.mjs','select-template','--state',state,'--template','t02-paper-dialogue']);
  run('node',['scripts/cli/workflow.mjs','select-background','--state',state,'--image',path.join(root,'assets/backgrounds/test-image-center.png'),'--anchor','center']);
  const preview=path.join(dir,'preview.png');run('node',['scripts/cli/preview-job.mjs','--state',state,'--engine','remotion','--output',preview]);run('node',['scripts/cli/workflow.mjs','approve-preview','--state',state]);run('node',['scripts/cli/render-job.mjs','--state',state,'--engine','remotion','--mode','all','--validation-candidate']);
  const job=JSON.parse(fs.readFileSync(state,'utf8'));if(job.parts.length<2)throw new Error('Expected multiple parts');
  const bg=job.visual?.productionVisualLock?.background?.backgroundRenderStateId;if(!bg)throw new Error('Missing production background lock');
  if(!job.visual?.renderManifest?.parts?.every(p=>p.backgroundRenderStateId===bg&&p.visualLockStateId===job.visual.productionVisualLock.id&&p.templateId==='t02-paper-dialogue'))throw new Error('Multi-Part visual lock mismatch');
  for(const p of job.parts)validateVideo(p.outputPath,ratio);
  const timeline=JSON.parse(fs.readFileSync(job.assets.timelinePath,'utf8'));const boundary=job.parts[1].globalStartFrame;
  const full=path.join(dir,'seam-full.png'),part=path.join(dir,'seam-part2.png');
  const baseProps={timeline:{...timeline,template:'t02-paper-dialogue'},backgroundRenderState:job.visual.backgroundRenderState};
  run('npx',['remotion','still','src/index.tsx','PaperUI',full,'--frame',String(boundary),'--props',JSON.stringify({...baseProps,globalStartFrame:0,globalEndFrameExclusive:timeline.durationInFrames})]);
  run('npx',['remotion','still','src/index.tsx','PaperUI',part,'--frame','0','--props',JSON.stringify({...baseProps,globalStartFrame:boundary,globalEndFrameExclusive:job.parts[1].globalEndFrameExclusive})]);
  if(sha256(full)!==sha256(part))throw new Error('Part 2 first frame does not match full-timeline global seam frame');
  add('T02-MULTIPART-PRODUCTION','PASS',`${job.parts.length} parts share one template/background/visual lock and Part 2 seam frame is pixel-identical`);
}catch(e){add('T02-MULTIPART-PRODUCTION','FAIL',e.message);writeManifest('FAIL');process.exit(1);}

writeManifest('PASS');console.log(`T02 production validation PASS. Manifest: ${manifestPath}`);
