import fs from 'node:fs';
import path from 'node:path';
import {parseDialogue} from '../../lib/dialogue-parser.mjs';
import {compileTimeline} from '../../lib/timeline-compiler.mjs';
import {segmentTimeline} from '../../lib/timeline-segmenter.mjs';
import {makeWorkflowState,selectTemplate,writeState} from '../../lib/workflow-state.mjs';
for(const language of ['en','zh']) {
 const base=path.resolve('validation/t02-preview',language);fs.mkdirSync(base,{recursive:true});
 const dialoguePath=path.resolve(`validation/t02-preview/dialogue-${language}.txt`);
 const timeline=compileTimeline(parseDialogue(fs.readFileSync(dialoguePath,'utf8')),{template:'t02-paper-dialogue',ratio:'9:16'});
 const manifest=segmentTimeline(timeline);
 const timelinePath=path.join(base,'timeline.json'),segmentsPath=path.join(base,'segments.json');
 fs.writeFileSync(timelinePath,JSON.stringify(timeline,null,2));fs.writeFileSync(segmentsPath,JSON.stringify(manifest,null,2));
 let state=makeWorkflowState({jobId:`t02-preview-${language}`,dialoguePath,timelinePath,segmentsPath,ratio:'9:16',outputBaseName:`t02-${language}`,outputDir:path.resolve('preview'),manifest});
 state=selectTemplate(state,'t02-paper-dialogue');
 for(const [key,file] of Object.entries({draftVisualConfigPath:'draft-visual-config.json',backgroundRenderStatePath:'background-render-state.json',previewStatePath:'preview-state.json',visualLockStatePath:'visual-lock-state.json',renderManifestPath:'render-manifest.json'}))state.assets[key]=path.join(base,file);
 state.assets.logsDir=path.resolve('logs');
 writeState(path.join(base,'job.json'),state);
 console.log(language,timeline.durationInFrames,'frames',manifest.partCount,'parts');
}
