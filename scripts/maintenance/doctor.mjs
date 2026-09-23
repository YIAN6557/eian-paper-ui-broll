#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {runtimeDependencyState, readRequiredNodeMajor} from './bootstrap-runtime.mjs';

const checks = [];
const projectRoot = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const run = (label, command) => {
  const result = spawnSync(command, {encoding:'utf8', shell:true});
  const output = (result.stdout || result.stderr || '').trim().split(String.fromCharCode(10))[0] || 'not found';
  const ok = result.status === 0;
  checks.push({label, ok, detail:output});
  return ok;
};

console.log('INFO  Platform: ' + process.platform + ' ' + process.arch);
const requiredNodeMajor = readRequiredNodeMajor(projectRoot);
const currentNodeMajor = Number(process.versions.node.split('.')[0]);
checks.push({
  label:'Node.js',
  ok:currentNodeMajor === requiredNodeMajor,
  detail:currentNodeMajor === requiredNodeMajor ? 'v' + process.versions.node + ' matches Node ' + requiredNodeMajor : 'Node ' + requiredNodeMajor + ' is required; found v' + process.versions.node,
});
run('npm', 'npm --version');
run('FFmpeg', 'ffmpeg -version');
run('FFprobe', 'ffprobe -version');

const runtime = runtimeDependencyState({projectRoot});
checks.push({
  label:'Lockfile-pinned Node packages',
  ok:runtime.ready,
  detail:runtime.ready ? 'Remotion CLI, Remotion, React and React DOM verified' : runtime.reason,
});

const browserPlatform = {
  'darwin-arm64':'mac-arm64',
  'darwin-x64':'mac-x64',
  'linux-arm64':'linux-arm64',
  'linux-x64':'linux64',
  'win32-x64':'win64',
}[process.platform + '-' + process.arch];
const chromeFolder = browserPlatform ? path.join(projectRoot, 'node_modules', '.remotion', 'chrome-headless-shell', browserPlatform, 'chrome-headless-shell-' + browserPlatform) : '';
const chromeBinary = chromeFolder ? path.join(chromeFolder, process.platform === 'win32' ? 'chrome-headless-shell.exe' : 'chrome-headless-shell') : '';
const systemBrowsers = process.platform === 'darwin'
  ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium']
  : [];
const managedBrowserReady = chromeBinary && fs.existsSync(chromeBinary);
const systemBrowserReady = systemBrowsers.some((candidate) => fs.existsSync(candidate));
checks.push({
  label:'Remotion browser',
  ok:Boolean(managedBrowserReady || systemBrowserReady),
  detail:managedBrowserReady ? 'Remotion-pinned Chrome Headless Shell is installed' : systemBrowserReady ? 'A system Chrome/Chromium is available' : 'run dependency-gate.sh after user consent to install it',
});

for (const check of checks) {
  console.log((check.ok ? 'PASS  ' : 'FAIL  ') + check.label + ': ' + check.detail);
}

const failed = checks.filter((check) => !check.ok);
if (failed.length) {
  console.error(String.fromCharCode(10) + '[eian-paper-ui-broll] ' + failed.length + ' environment check(s) failed.');
  process.exit(1);
}

console.log(String.fromCharCode(10) + '[eian-paper-ui-broll] Environment ready.');
