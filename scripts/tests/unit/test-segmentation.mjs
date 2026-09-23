import fs from 'node:fs';
import {segmentTimeline} from '../../lib/timeline-segmenter.mjs';

const timeline = JSON.parse(fs.readFileSync(new URL('../../../examples/fixtures/generated/timeline.long.json', import.meta.url), 'utf8'));
const manifest = segmentTimeline(timeline);
if (manifest.partCount < 2) throw new Error('Expected long timeline to split into multiple parts.');
let cursor = 0;
for (const p of manifest.parts) {
  if (p.globalStartFrame !== cursor) throw new Error(`Gap/overlap before part ${p.part}.`);
  if (p.durationInFrames < 72 || p.durationInFrames > 192) throw new Error(`Part ${p.part} violates 3–8 second rule.`);
  cursor = p.globalEndFrameExclusive;
}
if (cursor !== timeline.durationInFrames) throw new Error('Segments do not cover the complete timeline.');
if (!manifest.parts.slice(1).every((p) => p.startsWithCarryOver)) throw new Error('Continuation parts must carry prior visual state.');
console.log(`segmentation ok: ${manifest.partCount} parts, ${manifest.parts.map((p)=>p.durationSeconds.toFixed(2)+'s').join(', ')}`);
