#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {readState} from '../lib/workflow-state.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback = null) => { const i = argv.indexOf(name); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : fallback; };
const has = (name) => argv.includes(name);
const statePath = path.resolve(arg('--state', 'temp/job.json'));
const keepPreview = has('--keep-preview');
const keepState = has('--keep-state');
const state = readState(statePath);
if (state.phase !== 'completed' || !state.parts.every((p) => p.status === 'completed')) {
  throw new Error('Refusing cleanup: job is not fully completed. Failed/incomplete jobs must retain state, logs, Timeline, manifest, and intermediates.');
}
const finalOutputs = new Set(state.parts.map((p) => p.outputPath).filter(Boolean).map((p) => path.resolve(p)));
for (const out of finalOutputs) {
  if (!fs.existsSync(out)) throw new Error(`Refusing cleanup: final output is missing: ${out}`);
}

// Preview lives outside the job state directory in normal use, so remove it explicitly unless requested.
const previewPaths = [state.preview?.global?.path, ...Object.values(state.preview?.parts ?? {}).map((p) => p?.path)].filter(Boolean);
if (!keepPreview) for (const p of previewPaths) fs.rmSync(path.resolve(p), {force:true});

// The prepare step stores Timeline + segments beside job.json. Remove the whole job directory
// only after completion. Final MP4s live in outputDir and are never touched.
const jobDir = path.dirname(statePath);
if (keepState) {
  for (const p of [state.assets.timelinePath, state.assets.segmentsPath]) fs.rmSync(path.resolve(p), {force:true});
  // Keep job.json itself as a compact audit record.
} else {
  fs.rmSync(jobDir, {recursive:true, force:true});
}
console.log(JSON.stringify({cleaned:true, keepPreview, keepState, finalOutputs:[...finalOutputs]}, null, 2));
