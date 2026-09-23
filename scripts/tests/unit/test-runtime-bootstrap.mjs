import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {bootstrapRuntime, runtimeDependencyState} from '../../maintenance/bootstrap-runtime.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eian-paper-ui-broll-runtime-bootstrap-'));
const write = (relativePath, content = '{}\n') => {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), {recursive:true});
  fs.writeFileSync(target, content);
};
const installRuntimePackages = () => {
  write('node_modules/remotion/package.json');
  write('node_modules/@remotion/cli/package.json');
  write('node_modules/react/package.json');
  write('node_modules/react-dom/package.json');
};

try {
  write('.nvmrc', '22\n');
  write('package-lock.json', '{"lockfileVersion":3}\n');
  let invocations = 0;
  const npmRunner = ({projectRoot, args}) => {
    invocations += 1;
    assert.equal(projectRoot, root);
    assert.deepEqual(args, ['ci', '--no-audit', '--no-fund']);
    installRuntimePackages();
    return {status:0, stdout:'installed', stderr:''};
  };

  const pending = bootstrapRuntime({projectRoot:root, nodeVersion:'v22.23.0', npmRunner});
  assert.equal(pending.ok, false);
  assert.equal(pending.consentRequired, true);
  assert.match(pending.summary, /CONSENT_REQUIRED/);
  assert.equal(invocations, 0, 'The first check must not run npm ci before consent.');

  const first = bootstrapRuntime({projectRoot:root, nodeVersion:'v22.23.0', npmRunner, consent:true});
  assert.equal(first.ok, true);
  assert.equal(first.installed, true);
  assert.equal(invocations, 1, 'Explicit consent may restore missing dependencies once.');
  assert.equal(runtimeDependencyState({projectRoot:root, nodeVersion:'v22.23.0'}).ready, true);

  const repeated = bootstrapRuntime({projectRoot:root, nodeVersion:'v22.23.0', npmRunner});
  assert.equal(repeated.ok, true);
  assert.equal(repeated.installed, false);
  assert.equal(invocations, 1, 'Verified dependencies must be reused without installation.');

  write('package-lock.json', '{"lockfileVersion":3,"updated":true}\n');
  const afterLockChange = bootstrapRuntime({projectRoot:root, nodeVersion:'v22.23.0', npmRunner});
  assert.equal(afterLockChange.ok, false);
  assert.equal(afterLockChange.consentRequired, true);
  assert.equal(invocations, 1, 'A changed lockfile must not trigger an unapproved installation.');

  const approvedLockRefresh = bootstrapRuntime({projectRoot:root, nodeVersion:'v22.23.0', npmRunner, consent:true});
  assert.equal(approvedLockRefresh.ok, true);
  assert.equal(approvedLockRefresh.installed, true);
  assert.equal(invocations, 2, 'A changed lockfile is restored only after explicit consent.');

  const unsupportedNode = bootstrapRuntime({projectRoot:root, nodeVersion:'v20.18.0', npmRunner, consent:true});
  assert.equal(unsupportedNode.ok, false);
  assert.match(unsupportedNode.summary, /Node\.js 22 is required/);
  assert.equal(invocations, 2, 'An unsupported Node runtime must not invoke npm.');

  const failedInstallRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eian-paper-ui-broll-runtime-bootstrap-fail-'));
  try {
    fs.writeFileSync(path.join(failedInstallRoot, '.nvmrc'), '22\n');
    fs.writeFileSync(path.join(failedInstallRoot, 'package-lock.json'), '{"lockfileVersion":3}\n');
    const failedInstall = bootstrapRuntime({
      projectRoot:failedInstallRoot,
      nodeVersion:'v22.23.0',
      consent:true,
      npmRunner:() => ({status:1, stderr:'network unavailable'}),
    });
    assert.equal(failedInstall.ok, false);
    assert.equal(failedInstall.consentRequired, false);
    assert.match(failedInstall.summary, /Runtime dependency setup failed: network unavailable/);
  } finally {
    fs.rmSync(failedInstallRoot, {recursive:true, force:true});
  }

  console.log('consent runtime bootstrap tests: PASS');
} finally {
  fs.rmSync(root, {recursive:true, force:true});
}
