#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {parseDialogue} from '../lib/dialogue-parser.mjs';
import {compileTimeline} from '../lib/timeline-compiler.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : fallback;
};
const has = (name) => argv.includes(name);

const inputPath = arg('--input');
const outputPath = arg('--output', 'temp/timeline.generated.json');
const ratio = arg('--ratio', '9:16');
const userName = arg('--user-name');
const assistantName = arg('--assistant-name');
const userLabel = arg('--user-label');
const assistantLabel = arg('--assistant-label');
const taskText = arg('--task');
const taskMeta = arg('--task-meta', '20 MIN ELAPSED');

if (has('--help')) {
  console.log(`Usage:\n  node scripts/cli/dialogue-to-timeline.mjs --input dialogue.txt --output timeline.json [options]\n\nOptions:\n  --ratio 9:16|16:9|1:1\n  --user-name NAME\n  --assistant-name NAME\n  --user-label LABEL\n  --assistant-label LABEL\n  --task TEXT\n  --task-meta TEXT\n\nIf --input is omitted, dialogue is read from stdin.`);
  process.exit(0);
}

let raw;
if (inputPath) raw = fs.readFileSync(inputPath, 'utf8');
else raw = fs.readFileSync(0, 'utf8');

const messages = parseDialogue(raw, {
  userName,
  assistantName,
  userLabels: userLabel ? [userLabel] : [],
  assistantLabels: assistantLabel ? [assistantLabel] : [],
});
const timeline = compileTimeline(messages, {ratio, taskText: taskText ?? undefined, taskMeta});
const abs = path.resolve(outputPath);
fs.mkdirSync(path.dirname(abs), {recursive: true});
fs.writeFileSync(abs, JSON.stringify(timeline, null, 2) + '\n');
console.log(abs);
if (timeline.meta.requiresSegmentation) {
  console.error(`note: generated timeline is ${timeline.durationInFrames} frames (${(timeline.durationInFrames/timeline.fps).toFixed(2)}s) and will require segmentation in the next stage.`);
}
