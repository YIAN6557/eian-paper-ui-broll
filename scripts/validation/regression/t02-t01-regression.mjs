import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {bundle} from '@remotion/bundler';
import {openBrowser,selectComposition,renderFrames} from '@remotion/renderer';
const stage=process.argv[2];
assert(['before','after'].includes(stage));
const out=path.resolve(`validation/t02-preview/t01-${stage}`);fs.mkdirSync(out,{recursive:true});
const serveUrl=await bundle({entryPoint:path.resolve('src/index.tsx'),outDir:path.join(out,'bundle')});
const browser=await openBrowser('chrome');
const timeline=JSON.parse(fs.readFileSync('examples/fixtures/timeline-demo.json'));
const hashes={};
try {
for(const ratio of ['9:16','1:1','16:9']) {
 const inputProps={timeline:{...timeline,ratio}};
 const composition=await selectComposition({serveUrl,id:'PaperUI',inputProps,puppeteerInstance:browser});
 const frames=ratio==='9:16'?Array.from({length:composition.durationInFrames},(_,i)=>i):[0,28,77,100,composition.durationInFrames-1];
 await renderFrames({serveUrl,composition,inputProps,puppeteerInstance:browser,frames,scale:2/3,imageFormat:'png',outputDir:null,concurrency:3,onStart:()=>{},onFrameUpdate:()=>{},onFrameBuffer:(b,f)=>{hashes[`${ratio}/${f}`]=crypto.createHash('sha256').update(b).digest('hex');if(f===100)fs.writeFileSync(path.join(out,`${ratio.replace(':','x')}-100.png`),b);}});
 console.log(stage,ratio,frames.length,'frames rendered');
}
fs.writeFileSync(path.join(out,'hashes.json'),JSON.stringify(hashes,null,2));
if(stage==='after') {const before=JSON.parse(fs.readFileSync('validation/t02-preview/t01-before/hashes.json'));assert.deepEqual(hashes,before);console.log('T01 pixels: every tested frame SHA-256 is identical');}
} finally {await browser.close({silent:true});}
