import React from 'react';
import {AbsoluteFill, Img, staticFile, useVideoConfig} from 'remotion';
import type {BackgroundRenderState} from './types';

export const BackgroundLayer: React.FC<{state: BackgroundRenderState}> = ({state}) => {
  const {width, height} = useVideoConfig();
  const appearance = state.appearance ?? {opacity:1, blur:0, brightness:1};
  const filter = `blur(${appearance.blur ?? 0}px) brightness(${appearance.brightness ?? 1})`;

  if (state.type === 'solid') {
    return <AbsoluteFill style={{
      background: state.source.color ?? '#F3EFE7',
      opacity: appearance.opacity ?? 1,
      filter,
    }}/>;
  }

  const relative = state.source.publicRelativePath;
  if (!relative) {
    throw new Error(`BACKGROUND_PUBLIC_ASSET_MISSING:${state.backgroundId}`);
  }
  const src = staticFile(relative);

  if (state.type === 'paper' || !state.transform) {
    return <AbsoluteFill style={{overflow:'hidden', opacity:appearance.opacity ?? 1, filter}}>
      <Img src={src} style={{width:'100%', height:'100%', objectFit:'cover'}}/>
    </AbsoluteFill>;
  }

  const crop = state.transform.crop;
  const sourceWidth = state.source.width ?? crop.width;
  const sourceHeight = state.source.height ?? crop.height;
  const sx = width / crop.width;
  const sy = height / crop.height;

  return <AbsoluteFill style={{overflow:'hidden', opacity:appearance.opacity ?? 1, filter}}>
    <Img src={src} style={{
      position:'absolute',
      width:sourceWidth * sx,
      height:sourceHeight * sy,
      left:-crop.x * sx,
      top:-crop.y * sy,
      maxWidth:'none',
      maxHeight:'none',
    }}/>
  </AbsoluteFill>;
};
