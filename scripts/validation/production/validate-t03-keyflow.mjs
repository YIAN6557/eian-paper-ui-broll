#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {bundle} from '@remotion/bundler';
import {openBrowser, renderFrames, selectComposition} from '@remotion/renderer';
import {keyflowLayout} from '../../../src/templates/t03-keyflow/layout.mjs';
import {stateAt} from '../../../src/templates/t03-keyflow/model.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const evidenceRoot = path.join(root, 'validation', 't03-production-validation');
const manifestPath = path.join(root, 'validation', 't03-production-validation-manifest.json');
const results = [];

const add = (id, status, detail) => {
  results.push({id, status, detail});
  console.log(`${status === 'PASS' ? 'PASS' : 'FAIL'} ${id}: ${detail}`);
};

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const writeManifest = (status) => {
  fs.mkdirSync(path.dirname(manifestPath), {recursive: true});
  fs.writeFileSync(manifestPath, `${JSON.stringify({
    template: 't03-keyflow',
    validation: 'production',
    status,
    generatedAt: new Date().toISOString(),
    results,
  }, null, 2)}\n`);
};

const run = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited with ${result.status}`);
  return result.stdout;
};

const longMixedBody = [
  '这是一个用于验证 Keyflow perspective-safe text region 的长中英混排输入。',
  'The upper Dynamic Input lines should use the approved width before the lower safe area narrows near the keyboard. ',
  '键盘遮挡前必须先滚动，最后停在安全可读区域。',
].join('').repeat(2);

const timelineFor = (ratio) => ({
  template: 't03-keyflow',
  ratio,
  taskText: 'EIAN |开始输入你的想法......',
  messages: [{text: longMixedBody}],
  durationInFrames: 240,
});

const inputFor = (ratio) => ({
  timeline: timelineFor(ratio),
  globalStartFrame: 0,
  globalEndFrameExclusive: 240,
  backgroundRenderState: null,
});

const expectedVideo = (ratio) => ratio === '9:16'
  ? {width: 1080, height: 1920}
  : {width: 1920, height: 1080};

const probeVideo = (videoPath) => JSON.parse(run('ffprobe', [
  '-v', 'error',
  '-select_streams', 'v:0',
  '-count_frames',
  '-show_entries', 'stream=codec_name,width,height,r_frame_rate,nb_read_frames',
  '-of', 'json',
  videoPath,
]));

fs.mkdirSync(evidenceRoot, {recursive: true});

try {
  run('node', ['scripts/tests/unit/test-t03-keyflow.mjs']);
  add('T03-STATIC-CONTRACT', 'PASS', 'existing T03 Keyflow contract checks passed');
} catch (error) {
  add('T03-STATIC-CONTRACT', 'FAIL', error.message);
  writeManifest('FAIL');
  process.exit(1);
}

let browser;
try {
  const serveUrl = await bundle({
    entryPoint: path.join(root, 'src', 'index.tsx'),
    outDir: path.join(evidenceRoot, 'bundle'),
  });
  browser = await openBrowser('chrome');

  for (const ratio of ['9:16', '16:9']) {
    const layout = {...keyflowLayout(ratio), ratio};
    const inputProps = inputFor(ratio);
    const timeline = inputProps.timeline;
    const ratioRoot = path.join(evidenceRoot, ratio.replace(':', 'x'));
    const frameRoot = path.join(ratioRoot, 'representative-frames');
    fs.mkdirSync(frameRoot, {recursive: true});

    const frameZero = stateAt(timeline, layout, 0);
    assert.equal(frameZero.visible, '', `${ratio}: Frame 0 Dynamic Input body must be empty`);

    const finalState = stateAt(timeline, layout, 215);
    assert.equal(finalState.typing, false, `${ratio}: typing must finish before the final hold`);
    assert.ok(finalState.lines.length > 0, `${ratio}: long mixed text must be visible before freeze`);

    if (ratio === '16:9') {
      assert.equal(finalState.capacity, 3, '16:9: keyboard-safe viewport capacity must remain three lines');
      assert.ok(finalState.lines.length <= 3, '16:9: visible lines must stay within keyboard-safe capacity');
      assert.equal(finalState.widthFor(0), layout.textWidth, '16:9: upper text line must use full approved width');
      assert.equal(finalState.widthFor(1), layout.textWidth * 750 / 790, '16:9: middle line width must use approved safe-width ramp');
      assert.equal(finalState.widthFor(2), layout.textWidth * 690 / 790, '16:9: lower line width must use approved safe-width ramp');
      assert.equal(finalState.fadedTop, true, '16:9: long text must pre-scroll before unsafe reveal');
    }

    const composition = await selectComposition({
      serveUrl,
      id: 'PaperUI',
      inputProps,
      puppeteerInstance: browser,
    });
    assert.equal(composition.durationInFrames, 240, `${ratio}: formal composition must be 240 frames`);
    assert.equal(composition.fps, 24, `${ratio}: formal composition must be 24 fps`);

    const hashes = {};
    const renderRange = (frameRange) => renderFrames({
      composition,
      serveUrl,
      inputProps,
      frameRange,
      imageFormat: 'png',
      outputDir: null,
      concurrency: 3,
      puppeteerInstance: browser,
      onStart: () => {},
      onFrameUpdate: () => {},
      onFrameBuffer: (buffer, frame) => {
        hashes[frame] = sha256(buffer);
        if ([0, 100, 216].includes(frame)) {
          fs.writeFileSync(path.join(frameRoot, `frame-${String(frame).padStart(4, '0')}.png`), buffer);
        }
      },
    });
    await renderRange([0, 0]);
    await renderRange([100, 100]);
    await renderRange([216, 239]);

    const freezeHashes = Array.from({length: 24}, (_, index) => hashes[216 + index]);
    assert.equal(new Set(freezeHashes).size, 1, `${ratio}: final 24 raw frames must be pixel-identical`);
    fs.writeFileSync(path.join(ratioRoot, 'raw-frame-hashes.json'), `${JSON.stringify({
      frameZero: hashes[0],
      typingSample: hashes[100],
      finalFreeze: Object.fromEntries(Array.from({length: 24}, (_, index) => [216 + index, hashes[216 + index]])),
    }, null, 2)}\n`);

    const videoPath = path.join(ratioRoot, `t03-keyflow-${ratio.replace(':', 'x')}-long-mixed-validation.mp4`);
    run('npx', [
      'remotion', 'render',
      'src/index.tsx',
      'PaperUI',
      videoPath,
      '--codec', 'h264',
      '--pixel-format', 'yuv420p',
      '--props', JSON.stringify(inputProps),
    ]);
    const stream = probeVideo(videoPath).streams?.[0];
    const expected = expectedVideo(ratio);
    assert.ok(stream, `${ratio}: formal validation video must contain a video stream`);
    assert.equal(stream.codec_name, 'h264', `${ratio}: formal validation video must use H.264`);
    assert.equal(stream.width, expected.width, `${ratio}: formal validation video width mismatch`);
    assert.equal(stream.height, expected.height, `${ratio}: formal validation video height mismatch`);
    assert.equal(stream.r_frame_rate, '24/1', `${ratio}: formal validation video fps mismatch`);
    assert.equal(Number(stream.nb_read_frames), 240, `${ratio}: formal validation video frame count mismatch`);

    add(`T03-${ratio.toUpperCase().replace(':', 'X')}-PRODUCTION`, 'PASS', 'Frame 0, approved safe area, pre-scroll, final raw 24-frame freeze, and formal video passed');
  }
} catch (error) {
  add('T03-PRODUCTION-RENDER', 'FAIL', error.stack || error.message);
  writeManifest('FAIL');
  process.exitCode = 1;
} finally {
  if (browser) await browser.close({silent: true});
}

if (process.exitCode) process.exit(process.exitCode);
writeManifest('PASS');
console.log(`T03 production validation evidence: ${evidenceRoot}`);
