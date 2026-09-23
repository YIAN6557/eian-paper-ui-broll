import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  animation,
  fadeOutMask,
  fadeOutOpacityAtY,
} from '../../../src/templates/t02-paper-dialogue/animation.mjs';

assert.equal(animation.fadeOutZoneHeight, 48);
assert.equal(fadeOutMask(false), 'none');
assert.match(fadeOutMask(true), /linear-gradient/);

assert.equal(fadeOutOpacityAtY(animation.fadeOutZoneHeight), 1);
assert.equal(fadeOutOpacityAtY(0), 0);
assert.equal(fadeOutOpacityAtY(-1), 0);

let previous = 0;
for (let y = 0; y <= animation.fadeOutZoneHeight; y += 1) {
  const opacity = fadeOutOpacityAtY(y);
  assert(opacity >= previous, 'Opacity must change monotonically through the fixed zone');
  assert(opacity >= 0 && opacity <= 1);
  previous = opacity;
}

const component = fs.readFileSync(
  new URL('../../../src/templates/t02-paper-dialogue/T02PaperDialogue.tsx', import.meta.url),
  'utf8',
);
const model = fs.readFileSync(
  new URL('../../../src/templates/t02-paper-dialogue/model.mjs', import.meta.url),
  'utf8',
);

assert.match(component, /data-t02-fade-out-zone/);
assert.match(component, /fadeOutMask\(s\.overflow\s*>\s*0\)/);
assert.doesNotMatch(model, /successorY|handoff|physical/);

console.log('T02 fixed fade-out zone unit checks: PASS');
