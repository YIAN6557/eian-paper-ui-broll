import React from 'react';

export const StatusRail: React.FC<{
  label: string;
  progress: number;
  accent?: boolean;
}> = ({label, progress, accent = false}) => {
  const p = Math.max(0, Math.min(1, progress));
  return (
    <div style={{display:'flex', alignItems:'center', gap:18, height:42, flexShrink:0}}>
      <div style={{
        fontFamily:'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize:18,
        letterSpacing:'0.055em',
        color:'#77766f',
        whiteSpace:'nowrap',
      }}>{label}</div>
      <div style={{flex:1, display:'flex', alignItems:'center', gap:10}}>
        <div style={{position:'relative', flex:1, height:6, borderRadius:99, background:'#d7d7d1', overflow:'hidden'}}>
          <div style={{
            position:'absolute', left:0, top:0, bottom:0,
            width:`${p*100}%`,
            borderRadius:99,
            background:accent ? '#f04b0f' : '#a7a7a1',
          }}/>
        </div>
        <div style={{width:8, height:8, borderRadius:99, background:accent && p > 0.96 ? '#f04b0f' : '#b8b8b2'}}/>
      </div>
    </div>
  );
};
