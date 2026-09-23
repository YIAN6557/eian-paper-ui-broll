#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const outRoot = path.join(root, 'validation', 'production-validation');
const manifestPath = path.join(root, 'validation', 'production-validation-manifest.json');
fs.rmSync(outRoot, {recursive:true, force:true});
fs.mkdirSync(outRoot, {recursive:true});

const results = [];
const add = (id, status, detail='') => results.push({id,status,detail});
const run = (cmd, args, opts={}) => {
  const r = spawnSync(cmd, args, {cwd:root, encoding:'utf8', stdio:opts.capture ? 'pipe' : 'inherit'});
  if (opts.capture && r.stdout) process.stdout.write(r.stdout);
  if (opts.capture && r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0 && !opts.allowFail) throw new Error(`${cmd} ${args.join(' ')} failed (${r.status})`);
  return r;
};
const writeManifest = (overall) => {
  const summary = {
    pass: results.filter(x=>x.status==='PASS').length,
    blocked: results.filter(x=>x.status==='BLOCKED').length,
    fail: results.filter(x=>x.status==='FAIL').length,
  };
  fs.writeFileSync(manifestPath, JSON.stringify({
    suite:'STAGE3_PRODUCTION_VALIDATION',
    generatedAt:new Date().toISOString(),
    overall,
    results,
    summary,
  }, null, 2)+'\n');
};

// Gate 0: environment. Stop cleanly if Remotion is unavailable.
const doctor = run('node',['scripts/maintenance/doctor.mjs'],{allowFail:true,capture:true});
if (doctor.status !== 0) {
  add('PROD-ENV','BLOCKED','doctor did not pass; install project dependencies and rerun');
  writeManifest('BLOCKED');
  console.log(`\nProduction validation BLOCKED. Manifest: ${manifestPath}`);
  process.exit(2);
}
add('PROD-ENV','PASS','doctor passed');

// Keep regressions small and reuse existing tests.
for (const [id, script] of [
  ['PROD-REG-PARSER','scripts/tests/unit/test-dialogue-parser.mjs'],
  ['PROD-REG-SEGMENTATION','scripts/tests/unit/test-segmentation.mjs'],
  ['PROD-REG-WORKFLOW','scripts/tests/unit/test-workflow.mjs'],
  ['PROD-REG-BACKGROUND','scripts/tests/unit/test-stage3-background.mjs'],
]) {
  try { run('node',[script]); add(id,'PASS'); }
  catch (e) { add(id,'FAIL',e.message); writeManifest('FAIL'); process.exit(1); }
}

const selectTemplate = (state) => run('node',['scripts/cli/workflow.mjs','select-template','--state',state,'--template','t01-reference-research-console']);
const selectBackground = (state, bg, image=null) => image
  ? run('node',['scripts/cli/workflow.mjs','select-background','--state',state,'--image',image,'--anchor','center'])
  : run('node',['scripts/cli/workflow.mjs','select-background','--state',state,'--background',bg]);
const prepare = (name, dialogue='examples/inputs/dialogue.input.txt') => {
  const dir = path.join(outRoot,name); fs.mkdirSync(dir,{recursive:true});
  const state = path.join(dir,'job.json');
  run('node',['scripts/cli/prepare-job.mjs','--input',dialogue,'--state',state,'--name',name,'--output-dir',path.join(dir,'output')]);
  selectTemplate(state);
  return {dir,state};
};
const approveAndRender = ({state}, previewPath) => {
  run('node',['scripts/cli/preview-job.mjs','--state',state,'--engine','remotion','--output',previewPath]);
  run('node',['scripts/cli/workflow.mjs','approve-preview','--state',state]);
  run('node',['scripts/cli/render-job.mjs','--state',state,'--engine','remotion','--mode','all']);
  return JSON.parse(fs.readFileSync(state,'utf8'));
};
const probe = (file) => {
  const r = spawnSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=codec_name,width,height,r_frame_rate','-of','json',file],{encoding:'utf8'});
  if (r.status!==0) throw new Error(`ffprobe failed: ${file}`);
  return JSON.parse(r.stdout).streams?.[0];
};
const validateOutputs = (state) => {
  for (const p of state.parts) {
    if (p.status!=='completed' || !p.outputPath || !fs.existsSync(p.outputPath)) throw new Error(`Part ${p.part} incomplete`);
    const s=probe(p.outputPath);
    if (s.codec_name!=='h264' || s.r_frame_rate!=='24/1') throw new Error(`Unexpected video spec Part ${p.part}: ${JSON.stringify(s)}`);
  }
};

const cases = [
  ['PROD-BG-P01','bg-p01','BG-P01',null],
  ['PROD-SOLID','solid','BG-S01',null],
  ['PROD-PAPER','paper-warm','BG-P02',null],
  ['PROD-IMAGE','image-center',null,path.join(root,'assets/backgrounds/test-image-center.png')],
];
for (const [id,name,bg,image] of cases) {
  try {
    const job=prepare(name); selectBackground(job.state,bg,image);
    const state=approveAndRender(job,path.join(job.dir,'preview.png'));
    validateOutputs(state);
    add(id,'PASS',`${state.parts.length} part(s), Remotion preview + H.264 MP4`);
  } catch (e) {
    add(id,'FAIL',e.message); writeManifest('FAIL'); process.exit(1);
  }
}

// Multi-Part continuity: same locked BackgroundRenderState must be consumed by every Part.
try {
  const job=prepare('multi-part','examples/inputs/dialogue.long.txt');
  selectBackground(job.state,null,path.join(root,'assets/backgrounds/test-image-center.png'));
  const state=approveAndRender(job,path.join(job.dir,'preview.png'));
  validateOutputs(state);
  if (state.parts.length < 2) throw new Error('Expected multiple parts');
  const expected=state.visual?.productionVisualLock?.background?.backgroundRenderStateId;
  if (!expected) throw new Error('Missing production BackgroundRenderStateId');
  if (!state.visual?.renderManifest?.parts?.every(p=>p.backgroundRenderStateId===expected)) throw new Error('Background state mismatch across parts');
  add('PROD-MULTIPART','PASS',`${state.parts.length} parts share ${expected}`);
} catch (e) {
  add('PROD-MULTIPART','FAIL',e.message); writeManifest('FAIL'); process.exit(1);
}

writeManifest('PASS');
console.log(`\nStage 3 production validation PASS. Manifest: ${manifestPath}`);
