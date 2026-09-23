#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const messageBubble = fs.readFileSync(path.join(root, 'src/components/MessageBubble.tsx'), 'utf8');
const layout = fs.readFileSync(path.join(root, 'src/config/layout.ts'), 'utf8');
const reference = fs.readFileSync(path.join(root, 'dev/reference_renderer.py'), 'utf8');

assert.ok(!messageBubble.includes("minWidth:isUser ? '80%'"), 'user bubble must not restore the old 80% minimum width');
assert.ok(messageBubble.includes('userBubbleSafeMaxWidth[ratio]'), 'Remotion user bubble must use ratio-specific safe max width');
assert.ok(layout.includes("'9:16': 620"), '9:16 safe max width');
assert.ok(layout.includes("'1:1': 620"), '1:1 safe max width');
assert.ok(layout.includes("'16:9': 720"), '16:9 safe max width');
assert.ok(!reference.includes("minw=420 if side=='user'"), 'reference renderer must not restore the fixed user minimum');
assert.ok(reference.includes("maxw=413 if side=='user'"), '9:16 reference safe max must be scaled from production 620px');
assert.ok(reference.includes("bw=min(maxw,natural) if side=='user'"), 'reference user bubble must remain content-driven below safe max');

console.log('user bubble safe-width regression tests: PASS');
