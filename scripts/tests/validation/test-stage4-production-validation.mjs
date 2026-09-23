#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const result = spawnSync('node', ['scripts/validation/production/validate-stage4-ratios.mjs'], {
  cwd: root,
  encoding: 'utf8',
  stdio: 'pipe',
});

const outputRoot = path.join(root, 'validation', 'stage4-ratio-validation');
const manifestPath = path.join(root, 'validation', 'stage4-ratio-validation-manifest.json');
try {
  assert.equal(result.status, 0, result.stderr || result.stdout || 'Stage 4 production validation should pass');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.overall, 'PASS');
  assert.equal(manifest.results.find((entry) => entry.id === 'S4-9X16-REGRESSION')?.status, 'PASS');
  assert.equal(manifest.results.find((entry) => entry.id === 'S4-TAIL-STATIC')?.status, 'PASS');
  console.log('Stage 4 production validation gate: PASS');
} finally {
  fs.rmSync(outputRoot, {recursive:true, force:true});
  fs.rmSync(manifestPath, {force:true});
}
