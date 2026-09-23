#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolveCanonicalBuildIdentifier} from '../lib/skill-job-lifecycle.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifestPath = path.join(root, 'PACKAGE_MANIFEST.json');
const ignoredDirectoryNames = new Set(['.git', 'node_modules', 'temp', 'runtime-backgrounds']);
const ignoredFileNames = new Set(['.DS_Store', 'PACKAGE_MANIFEST.json']);
const ignoredExtensions = new Set(['.mp4', '.mov', '.webm']);
const toRelative = (absolutePath) => path.relative(root, absolutePath).split(path.sep).join('/');

const listPackageFiles = (directory = root, files = []) => {
  for (const entry of fs.readdirSync(directory, {withFileTypes:true}).sort((left, right) => left.name.localeCompare(right.name))) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectoryNames.has(entry.name)) listPackageFiles(absolutePath, files);
      continue;
    }
    if (!entry.isFile()) throw new Error('Package contains non-regular entry: ' + toRelative(absolutePath));
    if (ignoredFileNames.has(entry.name) || ignoredExtensions.has(path.extname(entry.name).toLowerCase())) continue;
    files.push(toRelative(absolutePath));
  }
  return files;
};

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const sourceManifest = fs.readFileSync(path.join(root, 'docs/project/canonical-project-manifest.md'), 'utf8');
const sourceBaseline = sourceManifest.match(/- (baseline\/[^\n]+skill-construction-validated-2026-09-11\.zip)/)?.[1];
if (!sourceBaseline) throw new Error('The preserved source baseline reference is missing.');
const files = listPackageFiles().sort().map((relativePath) => ({path: relativePath, sha256: sha256(fs.readFileSync(path.join(root, relativePath)))}));
const releaseHash = crypto.createHash('sha256');
releaseHash.update('eian-paper-ui-broll/github-release-package/v1\0', 'utf8');
for (const file of files) releaseHash.update(JSON.stringify(file) + '\n', 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const manifest = {
  schemaVersion: '1.1',
  package: 'eian-paper-ui-broll',
  packageVersion: packageJson.version,
  distribution: 'modular-codex-skill-package',
  canonicalBuildIdentifier: resolveCanonicalBuildIdentifier(root),
  sourceBaseline,
  releasePackageIdentifier: 'sha256:' + releaseHash.digest('hex'),
  packageRoot: '.',
  included: ['formal Skill entrypoint and OpenAI metadata','T01 / T02 / T03 templates and shared runtime source','read-only first-use dependency gate with explicit-consent setup, job lifecycle, Preview Gate, formal render and finalization scripts','default background assets, font licensing, examples, contracts and small immutable test fixtures','GitHub repository metadata, contribution guidance, CI and package validation'],
  excluded: ['node_modules and package-manager caches','temporary jobs, job state, logs, previews, frame sequences and rendered media','user-generated runtime backgrounds','historical ZIPs, baseline archives and project-root validation-evidence media'],
  fileCount: files.length,
  files,
};
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('PACKAGE_MANIFEST=UPDATED files=' + files.length + ' release=' + manifest.releasePackageIdentifier);
