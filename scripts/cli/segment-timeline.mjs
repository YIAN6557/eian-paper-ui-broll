#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {segmentTimeline} from '../lib/timeline-segmenter.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : fallback;
};
const inputPath = arg('--input');
const outputPath = arg('--output', 'temp/segments.generated.json');
if (!inputPath) throw new Error('Usage: node scripts/cli/segment-timeline.mjs --input timeline.json [--output segments.json]');
const timeline = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const manifest = segmentTimeline(timeline);
const abs = path.resolve(outputPath);
fs.mkdirSync(path.dirname(abs), {recursive: true});
fs.writeFileSync(abs, JSON.stringify(manifest, null, 2) + '\n');
console.log(abs);
for (const p of manifest.parts) {
  console.log(`part-${String(p.part).padStart(2,'0')}: ${p.globalStartFrame}-${p.globalEndFrameExclusive} (${p.durationSeconds.toFixed(2)}s) ${p.cutReason}`);
}
