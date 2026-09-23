#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {parseDialogue} from '../lib/dialogue-parser.mjs';
import {compileTimeline} from '../lib/timeline-compiler.mjs';
import {segmentTimeline} from '../lib/timeline-segmenter.mjs';
import {makeWorkflowState, writeState} from '../lib/workflow-state.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback = null) => { const i = argv.indexOf(name); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : fallback; };
const inputPath = arg('--input');
if (!inputPath) throw new Error('Usage: node scripts/cli/prepare-job.mjs --input dialogue.txt [--state temp/job.json] [--ratio 9:16] [--task TEXT] [--name BASE]');
const statePath = path.resolve(arg('--state', 'temp/job.json'));
const ratio = arg('--ratio', '9:16');
const taskText = arg('--task', 'Explore eian-paper-ui-broll');
const outputBaseName = arg('--name', 'paper-ui-broll');
const outputDir = path.resolve(arg('--output-dir', 'output'));

const raw = fs.readFileSync(inputPath, 'utf8');
const messages = parseDialogue(raw);
const timeline = compileTimeline(messages, {ratio, taskText});
const manifest = segmentTimeline(timeline);
const base = path.dirname(statePath);
const timelinePath = path.join(base, 'timeline.json');
const logsDir = path.join(base, 'logs');
const segmentsPath = path.join(base, 'segments.json');
fs.mkdirSync(base, {recursive:true});
fs.mkdirSync(logsDir, {recursive:true});
fs.mkdirSync(outputDir, {recursive:true});
fs.writeFileSync(timelinePath, JSON.stringify(timeline, null, 2) + '\n');
fs.writeFileSync(segmentsPath, JSON.stringify(manifest, null, 2) + '\n');
const jobId = `eian-${crypto.randomBytes(4).toString('hex')}`;
const state = makeWorkflowState({
  jobId,
  dialoguePath: path.resolve(inputPath),
  timelinePath,
  segmentsPath,
  ratio,
  outputBaseName,
  outputDir,
  manifest,
});
state.assets.logsDir = logsDir;
state.assets.draftVisualConfigPath = path.join(base, 'draft-visual-config.json');
state.assets.backgroundRenderStatePath = path.join(base, 'background-render-state.json');
state.assets.previewStatePath = path.join(base, 'preview-state.json');
state.assets.visualLockStatePath = path.join(base, 'visual-lock-state.json');
state.assets.renderManifestPath = path.join(base, 'render-manifest.json');
writeState(statePath, state);
console.log(JSON.stringify({statePath, jobId, recommendedTemplate: state.recommendation.template, partCount: manifest.partCount}, null, 2));
