import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {openBrowser, renderFrames, selectComposition} from '@remotion/renderer';
import {
  approveSkillJobPreview,
  confirmSkillJobFinalParameters,
  createAndPrepareSkillJob,
  finalizeSkillJobFormalRender,
  generateSkillJobPreview,
  renderSkillJobFormal,
} from '../../lib/skill-job-lifecycle.mjs';

const projectRoot = path.resolve('.');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eian-paper-ui-broll-skill-formal-integration-'));
const jobsRoot = path.join(root, 'jobs');
const shortDialogue = 'User: Preserve the locked visual contract.\nAI: This formal Skill render verifies the approved production path.';
const longDialogue = fs.readFileSync(path.join(projectRoot, 'examples', 'inputs', 'dialogue.long.txt'), 'utf8');
let sequence = 0;
const idFactory = (prefix) => () => `${prefix}-${++sequence}`;
const probe = (outputPath) => {
  const raw = execFileSync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0', '-count_frames',
    '-show_entries', 'stream=codec_name,width,height,r_frame_rate,nb_read_frames:format=duration',
    '-of', 'json', outputPath,
  ], {encoding:'utf8'});
  return JSON.parse(raw);
};
let serveUrl = null;
let browser = null;
const rawFinalFreeze = async ({skillJob, part}) => {
  const timeline = JSON.parse(fs.readFileSync(skillJob.workflow.timelineReference, 'utf8'));
  const workflow = JSON.parse(fs.readFileSync(skillJob.workflow.stateReference, 'utf8'));
  const end = Number(part.timelineEnd);
  assert(end >= 24, 'A final Part must contain the locked 24-frame hold.');
  if (!serveUrl) serveUrl = await bundle({entryPoint:path.join(projectRoot, 'src', 'index.tsx')});
  if (!browser) browser = await openBrowser('chrome');
  const inputProps = {
    timeline:['t02-paper-dialogue', 't03-keyflow'].includes(part.templateId) ? {...timeline, template:part.templateId} : timeline,
    globalStartFrame:end - 24,
    globalEndFrameExclusive:end,
    backgroundRenderState:workflow.visual?.backgroundRenderState ?? null,
  };
  const composition = await selectComposition({serveUrl, id:'PaperUI', inputProps, puppeteerInstance:browser});
  assert.equal(composition.durationInFrames, 24, 'Raw freeze composition must render exactly the final 24 frames.');
  const hashes = [];
  await renderFrames({
    composition, serveUrl, inputProps, frameRange:[0, 23], imageFormat:'png', outputDir:null,
    puppeteerInstance:browser, concurrency:3, onStart:() => {}, onFrameUpdate:() => {},
    onFrameBuffer:(buffer) => hashes.push(crypto.createHash('sha256').update(buffer).digest('hex')),
  });
  assert.equal(hashes.length, 24, 'Raw freeze verification must receive all final 24 frames.');
  assert.equal(new Set(hashes).size, 1, 'The template raw final 24 frames must remain pixel-identical.');
};
const create = ({prefix, input = shortDialogue, templateId, ratio, resolution}) => createAndPrepareSkillJob({
  input:{type:'labelled-text', value:input}, selection:{templateId, ratio, resolution}, jobsRoot, projectRoot, idFactory:idFactory(prefix),
});
const approveAndConfirm = (job) => {
  const preview = generateSkillJobPreview({statePath:job.persistence.statePath, projectRoot});
  assert.equal(preview.status, 'previewReady');
  const approved = approveSkillJobPreview({statePath:job.persistence.statePath, projectRoot});
  assert.equal(approved.status, 'readyForRender');
  return confirmSkillJobFinalParameters({statePath:job.persistence.statePath, projectRoot});
};
const assertMedia = async ({skillJob, expected, expectFinalHold}) => {
  const manifest = JSON.parse(fs.readFileSync(skillJob.persistence.manifestPath, 'utf8'));
  assert.equal(manifest.overallStatus, 'rendered');
  assert.equal(manifest.renderStatus, 'completed');
  for (const part of skillJob.render.parts) {
    const outputPath = path.join(skillJob.delivery.outputDirectory, part.filename);
    assert.equal(fs.existsSync(outputPath), true, `${part.filename} must exist.`);
    assert(fs.statSync(outputPath).size > 0, `${part.filename} must be non-empty.`);
    const metadata = probe(outputPath);
    const stream = metadata.streams?.[0];
    assert.equal(stream?.codec_name, 'h264', `${part.filename} must use H.264.`);
    assert.equal(stream?.width, expected.width, `${part.filename} width mismatch.`);
    assert.equal(stream?.height, expected.height, `${part.filename} height mismatch.`);
    assert.equal(stream?.r_frame_rate, '24/1', `${part.filename} must use 24fps.`);
    const frameCount = Number(stream?.nb_read_frames);
    assert.equal(frameCount, part.duration.frames, `${part.filename} must contain exactly its user-visible Part frame range.`);
    assert(Math.abs(Number(metadata.format.duration) - part.duration.seconds) < 0.1, `${part.filename} duration must match its plan.`);
    if (expectFinalHold && part.index === skillJob.render.parts.length) await rawFinalFreeze({skillJob, part});
  }
  return manifest;
};
const createWithExactlyTwoParts = () => {
  for (let repeat = 1; repeat <= 12; repeat += 1) {
    const job = create({prefix:`t01-multipart-${repeat}`, input:longDialogue.repeat(repeat), templateId:'t01-reference-research-console', ratio:'9:16', resolution:'720p'});
    if (job.durationPlan.userVisibleParts.length === 2) return job;
  }
  throw new Error('Could not create a two-Part formal render fixture.');
};

try {
  const t01 = approveAndConfirm(create({prefix:'t01-single', templateId:'t01-reference-research-console', ratio:'9:16', resolution:'720p'}));
  const t01Rendered = renderSkillJobFormal({statePath:t01.persistence.statePath, projectRoot});
  assert.equal(t01Rendered.status, 'rendered');
  const t01Manifest = await assertMedia({skillJob:t01Rendered, expected:{width:720, height:1280}, expectFinalHold:true});
  assert.deepEqual(t01Manifest.parts.map((part) => part.filename), ['final.mp4']);
  const t01Final = finalizeSkillJobFormalRender({statePath:t01.persistence.statePath, projectRoot});
  assert.equal(t01Final.status, 'completed');

  const t02 = approveAndConfirm(create({prefix:'t02-single', templateId:'t02-paper-dialogue', ratio:'1:1', resolution:'1080p'}));
  const t02Rendered = renderSkillJobFormal({statePath:t02.persistence.statePath, projectRoot});
  assert.equal(t02Rendered.status, 'rendered');
  await assertMedia({skillJob:t02Rendered, expected:{width:1080, height:1080}, expectFinalHold:true});
  assert.equal(finalizeSkillJobFormalRender({statePath:t02.persistence.statePath, projectRoot}).status, 'completed');

  const t03 = approveAndConfirm(create({prefix:'t03-single', templateId:'t03-keyflow', ratio:'16:9', resolution:'720p'}));
  const t03Rendered = renderSkillJobFormal({statePath:t03.persistence.statePath, projectRoot});
  assert.equal(t03Rendered.status, 'rendered');
  await assertMedia({skillJob:t03Rendered, expected:{width:1280, height:720}, expectFinalHold:true});
  assert.equal(finalizeSkillJobFormalRender({statePath:t03.persistence.statePath, projectRoot}).status, 'completed');

  const multipart = approveAndConfirm(createWithExactlyTwoParts());
  assert.equal(multipart.durationPlan.outputMode, 'multipart');
  const multipartRendered = renderSkillJobFormal({statePath:multipart.persistence.statePath, projectRoot});
  assert.equal(multipartRendered.status, 'rendered');
  assert.equal(multipartRendered.render.parts.length, 2);
  assert(multipartRendered.render.parts.every((part) => part.duration.frames <= 480), 'Every user-visible formal Part must be at most 20 seconds.');
  const multipartManifest = await assertMedia({skillJob:multipartRendered, expected:{width:720, height:1280}, expectFinalHold:true});
  assert.deepEqual(multipartManifest.parts.map((part) => part.filename), ['part-01.mp4', 'part-02.mp4']);
  assert.equal(fs.existsSync(path.join(multipartRendered.delivery.outputDirectory, 'final.mp4')), false, 'Multipart formal delivery must not create an automatic merged MP4.');
  const workflow = JSON.parse(fs.readFileSync(multipartRendered.workflow.stateReference, 'utf8'));
  assert.equal(workflow.userVisibleParts.length, 2);
  assert.equal(workflow.userVisibleParts[1].timelineStart, multipartRendered.render.parts[1].timelineStart);
  assert.equal(finalizeSkillJobFormalRender({statePath:multipart.persistence.statePath, projectRoot}).status, 'completed');

  console.log('Skill formal Remotion integration tests: PASS');
} finally {
  if (browser) await browser.close({silent:true});
  fs.rmSync(root, {recursive:true, force:true});
}
