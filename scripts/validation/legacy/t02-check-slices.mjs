import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {openBrowser,selectComposition,renderFrames} from '@remotion/renderer';
const browser=await openBrowser('chrome');const report=[];
try{for(const language of ['en','zh']) {
 const base=path.resolve('validation/t02-preview',language);
 const timeline=JSON.parse(fs.readFileSync(path.join(base,'timeline.json')));
 const segments=JSON.parse(fs.readFileSync(path.join(base,'segments.json')));
 const expected=JSON.parse(fs.readFileSync(path.join(base,'raw-frame-hashes.json')));
 const serveUrl=path.join(base,'bundle');
 for(const part of segments.parts) {
  const inputProps={timeline,globalStartFrame:part.globalStartFrame,globalEndFrameExclusive:part.globalEndFrameExclusive};
  const composition=await selectComposition({serveUrl,id:'PaperUI',inputProps,puppeteerInstance:browser});
  const frames=[0,1,composition.durationInFrames-2,composition.durationInFrames-1];
  await renderFrames({serveUrl,composition,inputProps,puppeteerInstance:browser,frames,scale:2/3,imageFormat:'png',outputDir:null,concurrency:2,onStart:()=>{},onFrameUpdate:()=>{},onFrameBuffer:(b,f)=>{
   const global=part.globalStartFrame+f;assert.equal(crypto.createHash('sha256').update(b).digest('hex'),expected[global],`Global slice mismatch: ${language}/${part.part}/${global}`);
  }});
  report.push({language,part:part.part,globalFrames:frames.map(f=>part.globalStartFrame+f),identical:true});
 }
}
fs.writeFileSync('validation/t02-preview/slice-continuity.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close({silent:true});}
