import React from 'react';

export const TypingBubble: React.FC<{startFrame:number; currentFrame:number}> = ({startFrame, currentFrame}) => {
  const p = Math.max(0, currentFrame - startFrame);
  return <div style={{
    alignSelf:'flex-start', display:'flex', gap:7,
    background:'#f2f2ee', padding:'15px 18px', borderRadius:24,
    marginBottom:22, flexShrink:0,
  }}>
    {[0,1,2].map((i) => {
      const phase = (p - i * 3) % 18;
      const opacity = phase >= 0 && phase < 8 ? 0.72 : 0.22;
      return <span key={i} style={{width:7,height:7,borderRadius:999,background:'#77766f',opacity,display:'block'}}/>;
    })}
  </div>;
};
