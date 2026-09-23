#!/usr/bin/env node
import fs from 'node:fs';
import assert from 'node:assert/strict';
const t01 = fs.readFileSync(new URL('../../../src/templates/t01-standard-chat/T01StandardChat.tsx', import.meta.url), 'utf8');
const ref = fs.readFileSync(new URL('../../../dev/reference_renderer.py', import.meta.url), 'utf8');
assert.ok(t01.includes('const frame = Math.min(rawFrame, lastMessageEnd)'), 'Remotion T01 must freeze every visual animation after the final event');
assert.ok(ref.includes('visual_frame=min(frame,freeze_frame)'), 'reference renderer must freeze every visual animation during hold');
console.log('final 24-frame hold regression tests: PASS');
