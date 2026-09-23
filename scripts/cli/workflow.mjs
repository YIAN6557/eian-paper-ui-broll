#!/usr/bin/env node
import path from 'node:path';
import {readState, writeState, selectTemplate, selectBackground, markPreviewReady, approvePreview, beginPartRender, completePartRender, failPartRender, workflowSummary} from '../lib/workflow-state.mjs';
import {createUserBackgroundDefinition} from '../lib/background-system.mjs';
import {applyTemplateTimingToState} from '../lib/template-timing.mjs';

const [command, ...argv] = process.argv.slice(2);
const arg = (name, fallback = null) => { const i = argv.indexOf(name); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : fallback; };
const statePath = path.resolve(arg('--state', 'temp/job.json'));
if (!command) throw new Error('Usage: workflow.mjs <summary|select-template|select-background|preview-ready|approve-preview|begin-render|complete-render|fail-render> --state job.json ...');
let state = readState(statePath);
const partArg = arg('--part');
const part = partArg === null ? null : Number(partArg);

switch (command) {
  case 'summary':
    console.log(JSON.stringify(workflowSummary(state), null, 2));
    process.exit(0);
  case 'select-template':
    state = selectTemplate(state, arg('--template'), {part});
    if (part === null) state = applyTemplateTimingToState(state, arg('--template'));
    break;
  case 'select-background': { 
    const image = arg('--image');
    const anchor = arg('--anchor', 'center');
    if (image) {
      const definition = createUserBackgroundDefinition({state, sourcePath:image, anchor});
      state = selectBackground(state, definition.id, {anchor, userDefinition:definition});
    } else {
      state = selectBackground(state, arg('--background'), {anchor:arg('--anchor')});
    }
    break;
  }
  case 'preview-ready':
    state = markPreviewReady(state, {path: path.resolve(arg('--path')), part}); break;
  case 'approve-preview':
    state = approvePreview(state, {part}); break;
  case 'begin-render':
    if (part === null) throw new Error('--part is required');
    state = beginPartRender(state, part); break;
  case 'complete-render':
    if (part === null) throw new Error('--part is required');
    state = completePartRender(state, part, path.resolve(arg('--output'))); break;
  case 'fail-render':
    if (part === null) throw new Error('--part is required');
    state = failPartRender(state, part, arg('--error', 'Unknown error')); break;
  default:
    throw new Error(`Unknown command: ${command}`);
}
writeState(statePath, state);
console.log(JSON.stringify(workflowSummary(state), null, 2));
