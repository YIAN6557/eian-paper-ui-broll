#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolveCanonicalBuildIdentifier} from '../lib/skill-job-lifecycle.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifestPath = path.join(root, 'PACKAGE_MANIFEST.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const ignoredDirectoryNames = new Set(['.git', 'node_modules', 'temp', 'runtime-backgrounds']);
const allowedGeneratedFiles = new Set(['PACKAGE_MANIFEST.json']);
const forbiddenExtensions = new Set(['.mp4', '.mov', '.webm']);
const toRelative = (absolutePath) => path.relative(root, absolutePath).split(path.sep).join('/');
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const actualFiles = [];
const visit = (directory) => {
  for (const entry of fs.readdirSync(directory, {withFileTypes:true}).sort((left, right) => left.name.localeCompare(right.name))) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = toRelative(absolutePath);
    if (entry.isDirectory()) {
      if (!ignoredDirectoryNames.has(entry.name)) visit(absolutePath);
      continue;
    }
    if (!entry.isFile()) throw new Error('Package contains non-regular entry: ' + relativePath);
    if (entry.name === '.DS_Store') throw new Error('Package contains forbidden metadata: ' + relativePath);
    if (forbiddenExtensions.has(path.extname(entry.name).toLowerCase())) throw new Error('Package contains forbidden rendered media: ' + relativePath);
    actualFiles.push(relativePath);
  }
};
visit(root);
const required = ['SKILL.md','README.md','README.zh-CN.md','LICENSE','LICENSE-STATUS.md','CONTRIBUTING.md','.gitignore','.gitattributes','.nvmrc','agents/openai.yaml','.github/workflows/ci.yml','src/templates/registry.mjs','src/templates/t01-standard-chat/T01StandardChat.tsx','src/templates/t02-paper-dialogue/T02PaperDialogue.tsx','src/templates/t03-keyflow/T03Keyflow.tsx','src/timeline/timeline.schema.json','specs/shared/WORKFLOW_STATE_MACHINE.md','specs/shared/TIMELINE_SCHEMA.md','docs/architecture/skill-production-contract.md','docs/setup/runtime-dependencies.md','docs/project/canonical-project-manifest.md','docs/project/project-status.md','scripts/cli/skill-job.mjs','scripts/maintenance/bootstrap-runtime.mjs','scripts/maintenance/dependency-gate.sh','scripts/maintenance/run-with-runtime.sh','scripts/maintenance/build-package-manifest.mjs','scripts/maintenance/validate-package.mjs','public/fonts/t02/NotoSansSC.ttf','public/fonts/t02/OFL.txt'];
for (const relativePath of required) if (!actualFiles.includes(relativePath)) throw new Error('Missing required release file: ' + relativePath);
if (actualFiles.some((file) => /^scripts\/[^/]+\.mjs$/.test(file))) throw new Error('Scripts must remain inside their modular cli/lib/maintenance/tests/validation directories.');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (packageJson.scripts?.['gate:check'] !== 'sh scripts/maintenance/dependency-gate.sh check') throw new Error('package.json must expose the read-only dependency gate.');
if (packageJson.scripts?.['gate:install'] !== 'sh scripts/maintenance/dependency-gate.sh install') throw new Error('package.json install command must not contain implicit consent.');
const skill = fs.readFileSync(path.join(root, 'SKILL.md'), 'utf8');
if (!skill.startsWith('---\nname: eian-paper-ui-broll\n')) throw new Error('SKILL.md frontmatter does not identify eian-paper-ui-broll.');
if (/\/Users\/[^/\s]+\/Desktop\//.test(skill)) throw new Error('SKILL.md must not contain a machine-specific Desktop path.');
if (!skill.includes('docs/setup/runtime-dependencies.md')) throw new Error('SKILL.md must route dependency setup to its authority file.');
const dependencies = fs.readFileSync(path.join(root, 'docs/setup/runtime-dependencies.md'), 'utf8');
if (!dependencies.includes('dependency-gate.sh check') || !dependencies.includes('dependency-gate.sh install --consent') || !dependencies.includes('explicit approval')) throw new Error('Runtime dependency guide must own the explicit-consent gate procedure.');
if (!skill.includes('docs/architecture/skill-production-contract.md')) throw new Error('SKILL.md must route detailed behavior to its authority file.');
const readmeEn = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
const readmeZh = fs.readFileSync(path.join(root, 'README.zh-CN.md'), 'utf8');
const licenseStatus = fs.readFileSync(path.join(root, 'LICENSE-STATUS.md'), 'utf8');
const licenseText = fs.readFileSync(path.join(root, 'LICENSE'), 'utf8');
if (!readmeEn.includes('LICENSE-STATUS.md') || !readmeEn.includes('LICENSE')) throw new Error('README.md must link to the license terms and status.');
if (!readmeZh.includes('LICENSE-STATUS.md') || !readmeZh.includes('LICENSE')) throw new Error('README.zh-CN.md must link to the license terms and status.');
if (!licenseStatus.includes('Eian Personal Non-Commercial License 1.0') || !licenseStatus.includes('not an OSI-approved open-source license')) throw new Error('License status must identify the selected source-available license.');
if (!licenseText.includes('Eian Personal Non-Commercial License 1.0') || !licenseText.includes('Commercial Use and Separate Authorization')) throw new Error('LICENSE must define the selected personal and commercial authorization terms.');
if (manifest.schemaVersion !== '1.1' || manifest.distribution !== 'modular-codex-skill-package') throw new Error('PACKAGE_MANIFEST schema or distribution is incorrect.');
if (manifest.canonicalBuildIdentifier !== resolveCanonicalBuildIdentifier(root)) throw new Error('PACKAGE_MANIFEST canonical build identifier is stale.');
if (!/^sha256:[0-9a-f]{64}$/.test(manifest.releasePackageIdentifier ?? '')) throw new Error('PACKAGE_MANIFEST release identifier is invalid.');
const expected = new Map((manifest.files ?? []).map((file) => [file.path, file.sha256]));
if (expected.size !== manifest.fileCount) throw new Error('PACKAGE_MANIFEST file count is inconsistent.');
for (const [relativePath, expectedHash] of expected) {
  if (!actualFiles.includes(relativePath)) throw new Error('Manifest file is missing: ' + relativePath);
  const actualHash = sha256(fs.readFileSync(path.join(root, relativePath)));
  if (actualHash !== expectedHash) throw new Error('Manifest hash mismatch: ' + relativePath);
}
const unexpected = actualFiles.filter((relativePath) => !expected.has(relativePath) && !allowedGeneratedFiles.has(relativePath));
if (unexpected.length) throw new Error('Unexpected distributable files: ' + JSON.stringify(unexpected));
const releaseHash = crypto.createHash('sha256');
releaseHash.update('eian-paper-ui-broll/github-release-package/v1\0', 'utf8');
for (const file of [...expected.entries()].map(([path, sha256]) => ({path, sha256})).sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)) releaseHash.update(JSON.stringify(file) + '\n', 'utf8');
if ('sha256:' + releaseHash.digest('hex') !== manifest.releasePackageIdentifier) throw new Error('PACKAGE_MANIFEST release identifier is stale.');
console.log('PACKAGE_RELEASE=PASS files=' + manifest.fileCount + ' canonical=' + manifest.canonicalBuildIdentifier + ' release=' + manifest.releasePackageIdentifier);
