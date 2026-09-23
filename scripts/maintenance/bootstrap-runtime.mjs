#!/usr/bin/env node
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const projectRootFromModule = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RUNTIME_MARKER_FILE = '.eian-paper-ui-broll-runtime.json';
const REQUIRED_RUNTIME_PACKAGES = Object.freeze([
  'remotion/package.json',
  '@remotion/cli/package.json',
  'react/package.json',
  'react-dom/package.json',
]);

const firstLine = (value) => String(value ?? '').split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? '';
const hashFile = (filePath) => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');

export const readRequiredNodeMajor = (projectRoot = projectRootFromModule) => {
  const nvmrcPath = path.join(projectRoot, '.nvmrc');
  if (!fs.existsSync(nvmrcPath)) throw new Error('Node version requirement is missing: .nvmrc');
  const declared = firstLine(fs.readFileSync(nvmrcPath, 'utf8'));
  const match = declared.match(/^(\d+)(?:\.\d+)?(?:\.\d+)?$/);
  if (!match) throw new Error('Unsupported .nvmrc version requirement: ' + (declared || '(empty)'));
  return Number(match[1]);
};

export const runtimeDependencyState = ({projectRoot = projectRootFromModule, nodeVersion = process.version} = {}) => {
  const root = path.resolve(projectRoot);
  let requiredNodeMajor;
  try {
    requiredNodeMajor = readRequiredNodeMajor(root);
  } catch (error) {
    return {ready:false, reason:error.message, requiredNodeMajor:null, actualNodeMajor:null, lockHash:null, missingPackages:[]};
  }
  const actualNodeMajor = Number(String(nodeVersion).replace(/^v/, '').split('.')[0]);
  if (!Number.isInteger(actualNodeMajor) || actualNodeMajor !== requiredNodeMajor) {
    return {
      ready:false,
      reason:'Node.js ' + requiredNodeMajor + ' is required; current runtime is ' + String(nodeVersion) + '.',
      requiredNodeMajor,
      actualNodeMajor:Number.isInteger(actualNodeMajor) ? actualNodeMajor : null,
      lockHash:null,
      missingPackages:[],
    };
  }
  const lockPath = path.join(root, 'package-lock.json');
  if (!fs.existsSync(lockPath)) {
    return {ready:false, reason:'package-lock.json is missing; deterministic runtime setup cannot continue.', requiredNodeMajor, actualNodeMajor, lockHash:null, missingPackages:[]};
  }
  const lockHash = hashFile(lockPath);
  const missingPackages = REQUIRED_RUNTIME_PACKAGES.filter((relativePath) => !fs.existsSync(path.join(root, 'node_modules', relativePath)));
  const markerPath = path.join(root, 'node_modules', RUNTIME_MARKER_FILE);
  let marker = null;
  try {
    marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  } catch {
    marker = null;
  }
  if (missingPackages.length) {
    return {ready:false, reason:'Missing lockfile dependencies: ' + missingPackages.join(', ') + '.', requiredNodeMajor, actualNodeMajor, lockHash, missingPackages, markerPath};
  }
  if (marker?.lockHash !== lockHash || marker?.nodeMajor !== actualNodeMajor) {
    return {ready:false, reason:'The installed Node dependencies are not verified for the current package-lock.json and Node.js version.', requiredNodeMajor, actualNodeMajor, lockHash, missingPackages:[], markerPath};
  }
  return {ready:true, reason:'Lockfile-pinned Node dependencies are ready.', requiredNodeMajor, actualNodeMajor, lockHash, missingPackages:[], markerPath};
};

const defaultNpmRunner = ({projectRoot}) => {
  const cacheDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'eian-paper-ui-broll-npm-cache-'));
  try {
    return spawnSync('npm', ['ci', '--no-audit', '--no-fund', '--cache', cacheDirectory], {
      cwd:projectRoot,
      encoding:'utf8',
    });
  } finally {
    fs.rmSync(cacheDirectory, {recursive:true, force:true});
  }
};

/**
 * Restores lockfile-pinned Node dependencies only after the user has approved
 * the complete dependency list shown by dependency-gate.sh.
 */
export const bootstrapRuntime = ({
  projectRoot = projectRootFromModule,
  nodeVersion = process.version,
  npmRunner = defaultNpmRunner,
  consent = false,
} = {}) => {
  const root = path.resolve(projectRoot);
  const before = runtimeDependencyState({projectRoot:root, nodeVersion});
  if (before.ready) return {...before, ok:true, installed:false, consentRequired:false, summary:'Lockfile dependencies already prepared.'};
  if (before.requiredNodeMajor === null || before.actualNodeMajor !== before.requiredNodeMajor) {
    return {...before, ok:false, installed:false, consentRequired:false, summary:before.reason};
  }
  if (!consent) {
    return {...before, ok:false, installed:false, consentRequired:true, summary:'CONSENT_REQUIRED: ' + before.reason};
  }
  if (!fs.existsSync(path.join(root, 'package-lock.json'))) {
    return {...before, ok:false, installed:false, consentRequired:false, summary:before.reason};
  }
  let result;
  try {
    result = npmRunner({projectRoot:root, args:['ci', '--no-audit', '--no-fund']});
  } catch (error) {
    return {...before, ok:false, installed:false, consentRequired:false, summary:'Unable to run npm ci: ' + (error?.message ?? String(error))};
  }
  if (result?.error || result?.status !== 0) {
    const detail = firstLine(result?.stderr) || firstLine(result?.stdout) || result?.error?.message || ('npm ci exited with status ' + String(result?.status));
    return {...before, ok:false, installed:false, consentRequired:false, summary:'Runtime dependency setup failed: ' + detail};
  }
  const after = runtimeDependencyState({projectRoot:root, nodeVersion});
  if (after.requiredNodeMajor === null || after.actualNodeMajor !== after.requiredNodeMajor || after.missingPackages?.length) {
    return {...after, ok:false, installed:false, consentRequired:false, summary:'Runtime dependency setup did not produce the required packages: ' + after.reason};
  }
  try {
    fs.mkdirSync(path.dirname(after.markerPath), {recursive:true});
    fs.writeFileSync(after.markerPath, JSON.stringify({schemaVersion:'1.0', lockHash:after.lockHash, nodeMajor:after.actualNodeMajor}, null, 2) + '\n');
  } catch (error) {
    return {...after, ok:false, installed:false, consentRequired:false, summary:'Runtime dependency setup could not record its verified state: ' + (error?.message ?? String(error))};
  }
  const verified = runtimeDependencyState({projectRoot:root, nodeVersion});
  return verified.ready
    ? {...verified, ok:true, installed:true, consentRequired:false, summary:'Lockfile dependencies installed and verified.'}
    : {...verified, ok:false, installed:false, consentRequired:false, summary:'Runtime dependency setup could not be verified: ' + verified.reason};
};

const isCliInvocation = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isCliInvocation) {
  const result = bootstrapRuntime({consent:process.argv.includes('--consent')});
  const status = result.ok ? (result.installed ? 'INSTALLED' : 'READY') : (result.consentRequired ? 'CONSENT_REQUIRED' : 'BLOCKED');
  console.log('RUNTIME_BOOTSTRAP=' + status + ' ' + result.summary);
  process.exit(result.ok ? 0 : result.consentRequired ? 2 : 1);
}
