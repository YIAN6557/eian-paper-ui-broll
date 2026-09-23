import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {MainCard} from '../../components/MainCard';
import {MessageBubble} from '../../components/MessageBubble';
import {TypingBubble} from '../../components/TypingBubble';
import {StatusRail} from '../../components/StatusRail';

import type {Timeline} from '../../timeline/types';

const clamp01 = (v:number) => Math.max(0, Math.min(1, v));
const easeOut = (v:number) => 1 - Math.pow(1-clamp01(v), 3);
const revealText = (text:string, progress:number) => {
  const p = clamp01(progress);
  const chunks:number[] = [];
  let i = 0;
  const pattern = [3,2,4,3,2,4];
  let pi = 0;
  while (i < text.length) {
    i = Math.min(text.length, i + pattern[pi++ % pattern.length]);
    chunks.push(i);
  }
  if (!chunks.length) return '';
  const idx = Math.min(chunks.length-1, Math.floor(p * chunks.length));
  return text.slice(0, chunks[idx] ?? 0);
};

export const T01StandardChat: React.FC<{timeline:Timeline; globalStartFrame?:number; externalBackground?:boolean}> = ({timeline, globalStartFrame = 0, externalBackground = false}) => {
  const localFrame = useCurrentFrame();
  const rawFrame = localFrame + globalStartFrame;
  const messages = timeline.messages;
  const assistantMessages = messages.filter((m) => m.speaker === 'assistant');
  const lastMessageEnd = messages.reduce((max, m) => {
    if (m.speaker === 'user') return Math.max(max, (m.startFrame ?? 0) + (m.enterFrames ?? 6));
    return Math.max(max, (m.revealStartFrame ?? 0) + (m.revealFrames ?? 24));
  }, 1);
  // Locked rule: once the final message has fully appeared, the whole UI
  // freezes for the 24-frame hold. This clamps dots, rails, bubbles, and
  // reveal state together without changing any pre-hold timing.
  const frame = Math.min(rawFrame, lastMessageEnd);
  const asyncProgress = clamp01(frame / Math.max(1, lastMessageEnd));
  const responseProgress = (() => {
    if (!assistantMessages.length) return 0;
    let completed = 0;
    let active = 0;
    for (const m of assistantMessages) {
      const start = m.revealStartFrame ?? 0;
      const duration = m.revealFrames ?? 24;
      if (frame >= start + duration) completed += 1;
      else if (frame >= start) active = clamp01((frame - start) / Math.max(1, duration));
    }
    return clamp01((completed + active) / assistantMessages.length);
  })();

  const rendered: React.ReactNode[] = [];
  for (const m of messages) {
    if (m.speaker === 'user') {
      const s = m.startFrame ?? 0;
      const d = m.enterFrames ?? 6;
      if (frame < s) continue;
      const t = easeOut((frame-s)/d);
      rendered.push(<MessageBubble key={m.id} side="user" text={m.text} name={m.name} opacity={t} translateX={18*(1-t)} ratio={timeline.ratio ?? '9:16'}/>);
      continue;
    }
    const ts = m.typingStartFrame ?? 0;
    const rs = m.revealStartFrame ?? (ts + (m.typingFrames ?? 15));
    const rd = m.revealFrames ?? 24;
    if (frame < ts) continue;
    if (frame < rs) {
      rendered.push(<TypingBubble key={m.id} startFrame={ts} currentFrame={frame}/>);
    } else {
      const shown = revealText(m.text, (frame-rs)/rd);
      const t = easeOut((frame-rs)/5);
      rendered.push(<MessageBubble key={m.id} side="assistant" text={shown} name={m.name} opacity={t} translateX={-12*(1-t)} ratio={timeline.ratio ?? '9:16'}/>);
    }
  }

  return <AbsoluteFill style={{
    background: externalBackground ? 'transparent' : '#e3e2dd',
    alignItems:'center',
    justifyContent:'center',
    fontFamily:'-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif',
  }}>
    <AbsoluteFill style={{
      opacity: externalBackground ? 0 : 0.11,
      backgroundImage:'radial-gradient(rgba(57,55,49,.48) 0.45px, transparent 0.58px)',
      backgroundSize:'6px 6px',
    }}/>
    <MainCard>
      <div style={{
        height:'25%',
        borderRadius:11,
        border:'1px solid rgba(71,69,62,0.11)',
        background:'#fafbf7',
        padding:'24px 24px 18px',
        boxSizing:'border-box',
        flexShrink:0,
      }}>
        <div style={{fontSize:20, lineHeight:1.33, color:'#1c1c1a', letterSpacing:'-0.015em'}}>
          {timeline.taskText ?? 'Research the user request, gather context, and return a concise answer.'}
        </div>
        <div style={{
          marginTop:14,
          fontFamily:'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          fontSize:17,
          letterSpacing:'0.08em',
          color:'#aaa9a3',
        }}>{timeline.taskMeta ?? '20 MIN ELAPSED'}</div>
        <div style={{display:'flex', gap:7, marginTop:13, width:78, height:25, borderRadius:20, alignItems:'center', justifyContent:'center', background:'#F57C28'}}>
          {[0,1,2,3].map((i) => {
            // Persistent background-work indicator: four dots cycle from light to
            // dark in sequence. Opacity only; no bounce, scale, or movement.
            const cycleFrames = 24;
            const phase = ((frame - i * 6) % cycleFrames + cycleFrames) % cycleFrames;
            const active = phase < 6;
            const opacity = active ? 1 : 0.34;
            return <span key={i} style={{
              width:7,
              height:7,
              borderRadius:99,
              background:'#777770',
              opacity,
            }}/>;
          })}
        </div>
      </div>

      <StatusRail label="ASYNC RESEARCH" progress={asyncProgress}/>

      <div style={{
        position:'relative',
        flex:1,
        minHeight:0,
        borderRadius:11,
        border:'1px solid rgba(71,69,62,0.10)',
        background:'#fafbf7',
        overflow:'hidden',
        padding:'24px 22px 8px',
        boxSizing:'border-box',
        display:'flex',
        flexDirection:'column',
        justifyContent:'flex-end',
      }}>
        <div style={{
          position:'absolute',
          left:22,
          right:22,
          bottom:8,
          display:'flex',
          flexDirection:'column',
          gap:22,
        }}>
          {rendered}
        </div>
        <div style={{
          position:'absolute',
          inset:'0 0 auto 0',
          height:34,
          pointerEvents:'none',
          background:'linear-gradient(to bottom, #fafbf7 0%, rgba(250,251,247,0.92) 28%, rgba(250,251,247,0) 100%)',
        }}/>
      </div>

      <StatusRail label="RESPONSES API" progress={responseProgress} accent/>
    </MainCard>
  </AbsoluteFill>;
};
