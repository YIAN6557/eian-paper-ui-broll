import React from 'react';
import {AbsoluteFill, Composition} from 'remotion';
import {T02PaperDialogue} from './templates/t02-paper-dialogue/T02PaperDialogue';
import {T03Keyflow} from './templates/t03-keyflow/T03Keyflow';
import {requirePreviewTemplate} from './templates/registry.mjs';
import {T01StandardChat} from './templates/t01-standard-chat/T01StandardChat';
import {BackgroundLayer} from './background/BackgroundLayer';
import example from '../examples/fixtures/timeline-demo.json';
import type {Timeline} from './timeline/types';
import type {BackgroundRenderState} from './background/types';
import {dimensions} from './config/layout';

type PaperUIProps = {
  timeline: Timeline;
  globalStartFrame?: number;
  globalEndFrameExclusive?: number;
  backgroundRenderState?: BackgroundRenderState | null;
};

const PaperUIComposition: React.FC<PaperUIProps> = ({
  timeline,
  globalStartFrame = 0,
  backgroundRenderState = null,
}) => {
  if (timeline.template === 't02-paper-dialogue') {
    requirePreviewTemplate(timeline.template, timeline.ratio ?? '9:16');
    const externalBackground = Boolean(backgroundRenderState && !backgroundRenderState.legacyT01Baseline);
    return <AbsoluteFill>
      {externalBackground && backgroundRenderState ? <BackgroundLayer state={backgroundRenderState}/> : null}
      <T02PaperDialogue timeline={timeline} globalStartFrame={globalStartFrame} externalBackground={externalBackground}/>
    </AbsoluteFill>;
  }
  if (timeline.template === 't03-keyflow') {
    requirePreviewTemplate(timeline.template, timeline.ratio ?? '9:16');
    return <T03Keyflow timeline={timeline} globalStartFrame={globalStartFrame}/>;
  }
  // BG-P01 is the locked T01 legacy canvas. Leaving the original T01 canvas
  // active guarantees that the locked baseline is not visually reinterpreted.
  const externalBackground = Boolean(backgroundRenderState && !backgroundRenderState.legacyT01Baseline);
  return <AbsoluteFill>
    {externalBackground && backgroundRenderState ? <BackgroundLayer state={backgroundRenderState}/> : null}
    <T01StandardChat timeline={timeline} globalStartFrame={globalStartFrame} externalBackground={externalBackground}/>
  </AbsoluteFill>;
};

const calculateMetadata = ({props}: {props: PaperUIProps}) => {
  const start = Math.max(0, Math.round(props.globalStartFrame ?? 0));
  const timelineEnd = Math.max(1, Math.round(props.timeline.durationInFrames ?? 1));
  const end = Math.min(timelineEnd, Math.max(start + 1, Math.round(props.globalEndFrameExclusive ?? timelineEnd)));
  const ratio = props.timeline.ratio ?? '9:16';
  const size = dimensions[ratio];
  return {
    durationInFrames: end - start,
    fps: 24,
    width: size.width,
    height: size.height,
    props: {...props, globalStartFrame: start, globalEndFrameExclusive: end},
  };
};

export const RemotionRoot: React.FC = () => {
  return <Composition
    id="PaperUI"
    component={PaperUIComposition}
    width={1080}
    height={1920}
    fps={24}
    durationInFrames={example.durationInFrames}
    defaultProps={{
      timeline: example,
      globalStartFrame: 0,
      globalEndFrameExclusive: example.durationInFrames,
      backgroundRenderState: null,
    }}
    calculateMetadata={calculateMetadata}
  />;
};
