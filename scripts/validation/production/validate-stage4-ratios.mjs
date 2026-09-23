#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const outRoot = path.join(root, 'validation', 'stage4-ratio-validation');
const manifestPath = path.join(root, 'validation', 'stage4-ratio-validation-manifest.json');
fs.rmSync(outRoot, {recursive:true, force:true});
fs.mkdirSync(outRoot, {recursive:true});
const results=[];
const add=(id,status,detail='')=>results.push({id,status,detail});
const run=(cmd,args,{allowFail=false,capture=false}={})=>{
  const r=spawnSync(cmd,args,{cwd:root,encoding:'utf8',stdio:capture?'pipe':'inherit'});
  if(capture&&r.stdout) process.stdout.write(r.stdout);
  if(capture&&r.stderr) process.stderr.write(r.stderr);
  if(r.status!==0&&!allowFail) throw new Error(`${cmd} ${args.join(' ')} failed (${r.status})`);
  return r;
};
const writeManifest=(overall)=>{
  const summary={pass:results.filter(x=>x.status==='PASS').length,blocked:results.filter(x=>x.status==='BLOCKED').length,fail:results.filter(x=>x.status==='FAIL').length};
  fs.writeFileSync(manifestPath,JSON.stringify({suite:'STAGE4_RATIO_ADAPTATION',generatedAt:new Date().toISOString(),overall,results,summary},null,2)+'\n');
};
const sha256=(file)=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const probe=(file)=>{
  const r=spawnSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=codec_name,width,height,r_frame_rate','-of','json',file],{encoding:'utf8'});
  if(r.status!==0) throw new Error(`ffprobe failed: ${file}`);
  return JSON.parse(r.stdout).streams?.[0];
};
const approved9x16UserBubbleDiff={x1:205,x2:588,y1:754,y2:991};
const finalHoldFrames=24;
const diffBounds=(before,after)=>{
  const r=spawnSync('ffmpeg',[
    '-hide_banner','-i',before,'-i',after,
    '-filter_complex','[0:v][1:v]blend=all_mode=difference,format=gray,bbox=1',
    '-frames:v','1','-f','null','-',
  ],{encoding:'utf8'});
  if(r.status!==0) throw new Error(`ffmpeg image comparison failed: ${r.stderr}`);
  const match=`${r.stdout}\n${r.stderr}`.match(/x1:(\d+)\s+x2:(\d+)\s+y1:(\d+)\s+y2:(\d+)/);
  return match ? {x1:Number(match[1]),x2:Number(match[2]),y1:Number(match[3]),y2:Number(match[4])} : null;
};
const validate9x16Regression=(preview)=>{
  const baseline=path.join(root,'validation','stage4-formal-baseline','stage3-production-validated-bg-p01-9x16-preview.png');
  if(!fs.existsSync(baseline)) throw new Error('Stage 3 production 9:16 baseline preview is missing');
  const actual=diffBounds(baseline,preview);
  if(!actual) throw new Error('Expected the approved Stage 4 user-bubble correction to differ from the Stage 3 baseline');
  if(JSON.stringify(actual)!==JSON.stringify(approved9x16UserBubbleDiff)) {
    throw new Error(`9:16 Remotion preview changed outside the approved user-bubble correction: ${JSON.stringify(actual)}`);
  }
};
const validateFinalHold=(statePath,job)=>{
  const state=JSON.parse(fs.readFileSync(statePath,'utf8'));
  const finalPart=job.parts.at(-1);
  const timeline=JSON.parse(fs.readFileSync(state.assets.timelinePath,'utf8'));
  const partFrames=finalPart.globalEndFrameExclusive-finalPart.globalStartFrame;
  if(partFrames<finalHoldFrames) throw new Error(`Final part has ${partFrames} frames; cannot validate ${finalHoldFrames}-frame hold`);
  const firstFrame=partFrames-finalHoldFrames;
  // Remotion 4 treats any dot in the full image-sequence path as a file extension.
  // Keep this transient frame directory outside ~/.codex so installed Skills work.
  const framesDir=fs.mkdtempSync(path.join(os.tmpdir(),'eian-paper-ui-broll-tail-static-'));
  try {
    const props=JSON.stringify({
      timeline,
      globalStartFrame:finalPart.globalStartFrame,
      globalEndFrameExclusive:finalPart.globalEndFrameExclusive,
      backgroundRenderState:state.visual.backgroundRenderState,
    });
    run('npx',['remotion','render','src/index.tsx','PaperUI',framesDir,'--sequence','--image-format=png','--frames',`${firstFrame}-${partFrames-1}`,'--props',props]);
    const frames=fs.readdirSync(framesDir).filter((name)=>name.endsWith('.png')).sort();
    if(frames.length!==finalHoldFrames) throw new Error(`Expected ${finalHoldFrames} raw tail frames, got ${frames.length}`);
    const hashes=frames.map((name)=>sha256(path.join(framesDir,name)));
    if(new Set(hashes).size!==1) throw new Error(`Final ${finalHoldFrames} raw Remotion frames are not pixel-identical`);
    return {count:frames.length,sha256:hashes[0]};
  } finally {
    fs.rmSync(framesDir,{recursive:true,force:true});
  }
};

const doctor=run('node',['scripts/maintenance/doctor.mjs'],{allowFail:true,capture:true});
if(doctor.status!==0){
  add('S4-ENV','BLOCKED','doctor did not pass; run on the production Remotion environment');
  writeManifest('BLOCKED');
  console.log(`Stage 4 validation BLOCKED. Manifest: ${manifestPath}`);
  process.exit(2);
}
add('S4-ENV','PASS','doctor passed');

for(const [id,script] of [
  ['S4-UNIT-RATIOS','scripts/tests/unit/test-stage4-ratios.mjs'],
  ['S4-REG-PARSER','scripts/tests/unit/test-dialogue-parser.mjs'],
  ['S4-REG-SEGMENTATION','scripts/tests/unit/test-segmentation.mjs'],
  ['S4-REG-WORKFLOW','scripts/tests/unit/test-workflow.mjs'],
  ['S4-REG-BACKGROUND','scripts/tests/unit/test-stage3-background.mjs'],
]){
  try{run('node',[script]);add(id,'PASS');}
  catch(e){add(id,'FAIL',e.message);writeManifest('FAIL');process.exit(1);}
}

const expected={
  '9:16':{preview:[720,1280],video:[1080,1920]},
  '1:1':{preview:[720,720],video:[1080,1080]},
  '16:9':{preview:[1280,720],video:[1920,1080]},
};

const renderCase=(ratio,name)=>{
  const dir=path.join(outRoot,name);fs.mkdirSync(dir,{recursive:true});
  const state=path.join(dir,'job.json');
  run('node',['scripts/cli/prepare-job.mjs','--input','examples/inputs/dialogue.input.txt','--state',state,'--name',name,'--ratio',ratio,'--output-dir',path.join(dir,'output')]);
  run('node',['scripts/cli/workflow.mjs','select-template','--state',state,'--template','t01-reference-research-console']);
  run('node',['scripts/cli/workflow.mjs','select-background','--state',state,'--background','BG-P01']);
  const preview=path.join(dir,'preview.png');
  run('node',['scripts/cli/preview-job.mjs','--state',state,'--engine','remotion','--output',preview]);
  run('node',['scripts/cli/workflow.mjs','approve-preview','--state',state]);
  run('node',['scripts/cli/render-job.mjs','--state',state,'--engine','remotion','--mode','all']);
  const job=JSON.parse(fs.readFileSync(state,'utf8'));
  const pprobe=probe(preview);
  const [pw,ph]=expected[ratio].preview;
  if(Number(pprobe.width)!==pw||Number(pprobe.height)!==ph) throw new Error(`${ratio} preview ${pprobe.width}x${pprobe.height}, expected ${pw}x${ph}`);
  for(const p of job.parts){
    const v=probe(p.outputPath);const [vw,vh]=expected[ratio].video;
    if(v.codec_name!=='h264'||v.r_frame_rate!=='24/1'||Number(v.width)!==vw||Number(v.height)!==vh) throw new Error(`${ratio} video spec mismatch: ${JSON.stringify(v)}`);
  }
  return {state,preview,job};
};

let nine;
try{
  nine=renderCase('9:16','ratio-9x16-regression');
  validate9x16Regression(nine.preview);
  add('S4-9X16-REGRESSION','PASS','9:16 pixels outside the approved user-bubble correction remain identical to the Stage 3 production Remotion baseline');
}catch(e){add('S4-9X16-REGRESSION','FAIL',e.message);writeManifest('FAIL');process.exit(1);}

const rendered=[nine];

for(const [ratio,name,id] of [['1:1','ratio-1x1','S4-1X1'],['16:9','ratio-16x9','S4-16X9']]){
  try{const r=renderCase(ratio,name);rendered.push(r);add(id,'PASS',`${ratio} Remotion preview + H.264 MP4 (${r.job.parts.length} part(s))`);}
  catch(e){add(id,'FAIL',e.message);writeManifest('FAIL');process.exit(1);}
}

try{
  const holds=rendered.map((r)=>validateFinalHold(r.state,r.job));
  add('S4-TAIL-STATIC','PASS',`${holds.map((hold)=>`${hold.count} raw Remotion frames`).join(', ')} are pixel-identical per ratio`);
}catch(e){add('S4-TAIL-STATIC','FAIL',e.message);writeManifest('FAIL');process.exit(1);}

writeManifest('PASS');
console.log(`Stage 4 ratio validation PASS. Manifest: ${manifestPath}`);
