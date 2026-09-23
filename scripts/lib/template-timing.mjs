import fs from 'node:fs';
import {segmentTimeline} from './timeline-segmenter.mjs';

export const T02_INTRO_DELAY_FRAMES = 8;

export const templateTimingOffsetFrames = (template, ratio = '9:16') => (
  template === 't02-paper-dialogue' && (ratio === '1:1' || ratio === '16:9')
    ? T02_INTRO_DELAY_FRAMES
    : 0
);

const timingFields = ['startFrame', 'typingStartFrame', 'revealStartFrame'];

export const applyTemplateTimingToState = (inputState, template) => {
  const state = JSON.parse(JSON.stringify(inputState));
  if (!state?.assets?.timelinePath || !state?.assets?.segmentsPath) {
    throw new Error('Template timing requires timelinePath and segmentsPath.');
  }
  const timeline = JSON.parse(fs.readFileSync(state.assets.timelinePath, 'utf8'));
  const ratio = state.input?.ratio ?? timeline.ratio ?? '9:16';
  const desired = templateTimingOffsetFrames(template, ratio);
  const current = Number(timeline.meta?.templateTimingOffsetFrames ?? 0);
  const delta = desired - current;

  timeline.template = template;
  timeline.meta = {
    ...(timeline.meta ?? {}),
    templateTimingOffsetFrames: desired,
    templateTimingRule: desired === T02_INTRO_DELAY_FRAMES ? 't02-empty-card-intro-8-frames' : 'none',
  };

  if (delta !== 0) {
    for (const message of timeline.messages ?? []) {
      for (const field of timingFields) {
        if (Number.isFinite(message[field])) message[field] = Math.max(0, Number(message[field]) + delta);
      }
    }
    timeline.durationInFrames = Number(timeline.durationInFrames ?? 0) + delta;
    if (timeline.durationInFrames <= 0) throw new Error('Template timing produced a non-positive duration.');
  }

  const manifest = segmentTimeline(timeline);
  fs.writeFileSync(state.assets.timelinePath, JSON.stringify(timeline, null, 2) + '\n');
  fs.writeFileSync(state.assets.segmentsPath, JSON.stringify(manifest, null, 2) + '\n');

  state.parts = manifest.parts.map((part) => ({
    ...part,
    status: 'pending',
    formalRenderStarted: false,
    outputPath: null,
    error: null,
  }));
  state.events = state.events ?? [];
  state.events.push({
    at: new Date().toISOString(),
    type: 'template-timing-applied',
    template,
    ratio,
    previousOffsetFrames: current,
    offsetFrames: desired,
    deltaFrames: delta,
    partCount: manifest.partCount,
  });
  return state;
};
