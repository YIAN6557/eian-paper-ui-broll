import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import {previewCanvasForRatio} from './lib/background-system.mjs';
const timeline = JSON.parse(fs.readFileSync(new URL('../../examples/fixtures/timeline-demo.json', import.meta.url)));
const frame = Math.max(0, timeline.durationInFrames - timeline.holdFrames - 4);
const previewSize = previewCanvasForRatio(timeline.ratio ?? '9:16');
execFileSync('npx', ['remotion','still','src/index.tsx','PaperUI','preview.png','--frame',String(frame),'--width',String(previewSize.width),'--height',String(previewSize.height)], {stdio:'inherit'});
