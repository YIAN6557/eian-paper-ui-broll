import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {bundle} from '@remotion/bundler';
import {openBrowser,selectComposition,renderFrames} from '@remotion/renderer';
const language=process.argv[2]??'en';assert(['en','zh'].includes(language));
const quick=process.argv.includes('--calibrate');
const base=path.resolve('validation/t02-preview',language);
const inputProps={timeline:JSON.parse(fs.readFileSync(path.join(base,'timeline.json')))};
inputProps.globalStartFrame=0;inputProps.globalEndFrameExclusive=inputProps.timeline.durationInFrames;
const output=path.resolve('preview');fs.mkdirSync(path.join(output,'keyframes'),{recursive:true});
const serveUrl=await bundle({entryPoint:path.resolve('src/index.tsx'),outDir:path.join(base,'bundle')});
const browser=await openBrowser('chrome');
try {
 const composition=await selectComposition({serveUrl,id:'PaperUI',inputProps,puppeteerInstance:browser});
 const end=composition.durationInFrames;
 const hashes={},evidence={};
 const framesDir=path.join(base,quick?'calibration-frames':'raw-frames');fs.mkdirSync(framesDir,{recursive:true});
 const fadeFrames=language==='en'?[306,307,308,309]:[170,171,172];
 const selected=[0,28,35,52,80,110,150,190,220,260,...fadeFrames,end-25,end-1].filter(f=>f<end);
 const result=await renderFrames({serveUrl,composition,inputProps,puppeteerInstance:browser,outputDir:null,frames:quick?selected:undefined,
  imageFormat:'png',logLevel:'error',scale:2/3,concurrency:3,envVariables:{T02_CAPTURE_EVIDENCE:'1'},
  onStart:({frameCount})=>console.log(`Rendering ${language}: ${frameCount} native Remotion frames at 720x1280`),
  onFrameUpdate:(count)=>{if(count%48===0)console.log('Rendered',count);},
  onBrowserLog:(log)=>{if(log.text.includes('T02_EVIDENCE:')){const v=JSON.parse(log.text.slice(log.text.indexOf('T02_EVIDENCE:')+13));evidence[v.rawFrame]=v;}else if(log.type==='error')console.error(log.text);},
  onFrameBuffer:(b,f)=>{fs.writeFileSync(path.join(framesDir,`frame-${String(f).padStart(4,'0')}.png`),b);hashes[f]=crypto.createHash('sha256').update(b).digest('hex');if(selected.includes(f))fs.writeFileSync(path.join(output,'keyframes',`${language}-${String(f).padStart(4,'0')}.png`),b);},
 });
 fs.writeFileSync(path.join(base,quick?'calibration-evidence.json':'render-evidence.json'),JSON.stringify(evidence));
 fs.writeFileSync(path.join(base,quick?'calibration-hashes.json':'raw-frame-hashes.json'),JSON.stringify(hashes,null,2));
 if(!quick){
  const freeze=Array.from({length:24},(_,i)=>hashes[end-24+i]);assert.equal(freeze.length,24);assert(freeze.every(Boolean));assert.equal(new Set(freeze).size,1,'final raw Remotion frames must match');
  const video=path.join(output,language==='en'?'t02-9x16-preview.mp4':'t02-9x16-preview-zh.mp4');
  execFileSync('ffmpeg',['-y','-v','error','-framerate','24','-i',path.join(framesDir,'frame-%04d.png'),'-an','-c:v','libx264','-pix_fmt','yuv420p','-qp','18','-g','1','-bf','0','-movflags','+faststart',video],{stdio:'inherit'});
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',video],{encoding:'utf8'}));
  fs.writeFileSync(path.join(base,'ffprobe.json'),JSON.stringify(probe,null,2));
  const decoded=execFileSync('ffmpeg',['-v','error','-i',video,'-vf',`select=gte(n\\,${end-24})`,'-fps_mode','passthrough','-f','framemd5','-'],{encoding:'utf8'});
  fs.writeFileSync(path.join(base,'decoded-final-24.framemd5'),decoded);
  const decodedHashes=decoded.split('\n').filter(l=>l&&!l.startsWith('#')).map(l=>l.split(',').at(-1).trim());
  assert.equal(decodedHashes.length,24);assert.equal(new Set(decodedHashes).size,1);
  const summary={decodedFinal24Identical:true,decodedMD5:decodedHashes[0],encoding:'H.264 yuv420p, all-intra, constant QP 18',language,frameCount:end,rawFinalFrames:[end-24,end-1],rawFinal24Identical:true,sha256:freeze[0],video};
  fs.writeFileSync(path.join(base,'freeze-check.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
 }
}finally{await browser.close({silent:true});}
