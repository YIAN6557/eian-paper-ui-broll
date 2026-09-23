#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const tempDir = path.join(root, 'temp');

fs.rmSync(tempDir, {recursive: true, force: true});
fs.mkdirSync(tempDir, {recursive: true});
fs.rmSync(path.join(root, 'preview.png'), {force: true});

console.log('Temporary render files cleaned. Final MP4 files are untouched.');
