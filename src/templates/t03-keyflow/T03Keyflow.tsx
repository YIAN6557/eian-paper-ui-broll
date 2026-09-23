import React, {useMemo} from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import type {Timeline} from '../../timeline/types';
import {keyflowLayout} from './layout.mjs';
import {stateAt} from './model.mjs';

const colors=['#d9484f','#d39b35','#418b60'];
type KeyDef={key:string;span?:number;tone?:'cyan'|'gold'|'coral'|'knob'};
const keyRows:KeyDef[][]=[
  [{key:'esc',tone:'cyan'},...['1','2','3','4','5','6','7','8','9','0','-','='].map(key=>({key})),{key:'backspace',span:1.75,tone:'coral'}],
  [{key:'tab',span:1.4},...['Q','W','E','R','T','Y','U','I','O','P','[',']','\\'].map(key=>({key})),{key:'',tone:'gold'}],
  [{key:'caps',span:1.65},...['A','S','D','F','G','H','J','K','L',';',"'"].map(key=>({key})),{key:'enter',span:2},{key:'home'}],
  [{key:'shift',span:2},...['Z','X','C','V','B','N','M',',','.','/'].map(key=>({key})),{key:'shift-r',span:1.65},{key:'↑'},{key:'end',tone:'gold'}],
  [{key:'ctrl',span:1.3},{key:'opt',span:1.25},{key:'cmd',span:1.35},{key:'space',span:5.9},{key:'cmd-r',span:1.25},{key:'fn'},{key:'ctrl-r',span:1.25},{key:'←'},{key:'↓'},{key:'→'}],
];
const keyIndexForTypingEvent=(eventIndex:number,keyCount:number):number=>{
  const mix=(seed:number)=>{let value=seed>>>0;value=Math.imul(value^(value>>>16),0x45d9f3b);value=Math.imul(value^(value>>>16),0x45d9f3b);return (value^(value>>>16))>>>0;};
  const mixed=mix(eventIndex+0x9e3779b9); const candidate=mixed%keyCount;
  if(eventIndex===0)return candidate;
  const previous=keyIndexForTypingEvent(eventIndex-1,keyCount);
  return candidate===previous?(candidate+1+((mixed>>>8)%(keyCount-1)))%keyCount:candidate;
};
const Keyboard:React.FC<{frame:number;typing:boolean;ratio:string}> = ({frame,typing,ratio}) => {
  const all=keyRows.flat().filter(({key})=>key); const active=typing?all[keyIndexForTypingEvent(Math.floor(frame/3),all.length)].key:null;
  const label=(key:string)=>({backspace:'BACKSPACE',enter:'ENTER',shift:'SHIFT', 'shift-r':'SHIFT',caps:'CAPS',tab:'TAB',ctrl:'CTRL','ctrl-r':'CTRL',opt:'OPT',cmd:'CMD','cmd-r':'CMD'} as Record<string,string>)[key]??key;
  return <div data-t03-keyboard style={{position:'absolute',left:ratio==='16:9'?'12%':'4%',width:ratio==='16:9'?'76%':'92%',bottom:20,height:ratio==='16:9'?260:280,padding:'14px 18px 16px',boxSizing:'border-box',borderRadius:26,background:'linear-gradient(180deg,#e1e3e9,#d3d6dd)',border:'1px solid rgba(86,92,109,.28)',boxShadow:'inset 0 2px 0 rgba(255,255,255,.76), 0 16px 25px rgba(57,58,84,.20)',display:'flex',flexDirection:'column',gap:7,transform:'translateZ(0)'}}>
    <div aria-hidden="true" style={{position:'absolute',left:8,top:17,bottom:18,width:5,borderRadius:99,background:'#59c8c3',boxShadow:'0 0 0 1px rgba(47,153,153,.18)'}}/>
    <div aria-hidden="true" style={{position:'absolute',right:8,top:17,bottom:18,width:5,borderRadius:99,background:'#59c8c3',boxShadow:'0 0 0 1px rgba(47,153,153,.18)'}}/>
    {keyRows.map((row,rowIndex)=><div key={rowIndex} style={{display:'grid',gridTemplateColumns:row.map(def=>`${def.span??1}fr`).join(' '),gap:7,height:ratio==='16:9'?(rowIndex===4?39:37):(rowIndex===4?43:41)}}>{row.map((def,columnIndex)=>{const {key,tone}=def; const pressed=key===active; const color=tone==='coral'?'#df775f':tone==='gold'?'#e5c94f':tone==='cyan'?'#5bc4b6':'linear-gradient(180deg,#ffffff,#e9edf3)'; const underside=tone==='coral'?'#b85148':tone==='gold'?'#b69a32':tone==='cyan'?'#3b978e':'#2968de'; return <div key={`${rowIndex}-${columnIndex}`} data-t03-key style={{minWidth:0,borderRadius:7,background:color,border:'1px solid rgba(73,83,106,.28)',boxShadow:`inset 0 1px 0 rgba(255,255,255,.78), 0 ${pressed?2:4}px 0 ${underside}, 0 ${pressed?3:6}px 7px rgba(53,59,78,.14)`,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'SF Pro Display, SF Pro Text, PingFang SC, sans-serif',fontSize:key.length>5?9:12,fontWeight:400,color:tone==='coral'?'#772d2b':'#4c5962',transform:pressed?'translateY(1.2px)':'translateY(0)',overflow:'hidden',whiteSpace:'nowrap'}}>{label(key)}</div>})}</div>)}
  </div>;
};

export const T03Keyflow:React.FC<{timeline:Timeline;globalStartFrame?:number}> = ({timeline,globalStartFrame=0}) => {
 const local=useCurrentFrame(); const unfrozenFrame=local+globalStartFrame; const finalHoldStart=Math.max(0,(timeline.durationInFrames??1)-Math.max(24,timeline.holdFrames??24)); const frame=Math.min(unfrozenFrame,Math.max(0,finalHoldStart-1)); const L=keyflowLayout(timeline.ratio??'9:16') as any; L.ratio=timeline.ratio??'9:16'; const s=useMemo(()=>stateAt(timeline,L,frame),[timeline,L.ratio,frame]);
 const enter=interpolate(s.visualFrame,[0,18],[0,1],{extrapolateRight:'clamp'}); const float=s.visualFrame>=Math.max(0,(timeline.durationInFrames??204)-24)?0:Math.sin(s.visualFrame/41)*2.1;
 const header=timeline.taskText||'EIAN |开始输入你的想法......';
 return <AbsoluteFill lang="zh-CN" style={{overflow:'hidden',fontFamily:'SF Pro Text, SF Pro Display, PingFang SC, sans-serif',fontWeight:400,fontSynthesis:'none',background:'linear-gradient(180deg,#f3edf6 0%,#efe8f4 48%,#c5a8ff 100%)'}}>
   <AbsoluteFill style={{opacity:.58,background:`radial-gradient(ellipse at ${48+Math.sin(s.visualFrame/170)*2}% ${35+Math.cos(s.visualFrame/190)*2}%,rgba(255,255,255,.92) 0%,rgba(255,255,255,.38) 38%,transparent 70%)`}}/>
   <div data-t03-component style={{position:'absolute',left:L.cardLeft,top:L.cardTop,width:L.cardWidth,height:L.cardHeight,opacity:enter,transform:`translateY(${(1-enter)*20+float}px) rotate(${L.angle}deg)`,transformOrigin:'center',filter:'drop-shadow(0 35px 32px rgba(35,18,71,.32))'}}>
     <div data-t03-glass-card style={{position:'absolute',inset:0,borderRadius:L.windowRadius+8,background:'linear-gradient(140deg,rgba(255,255,255,.54),rgba(199,177,235,.40))',border:'1px solid rgba(255,255,255,.58)',boxShadow:'inset 0 1px 0 rgba(255,255,255,.68)'}}/>
     <div data-t03-window style={{position:'absolute',inset:L.windowInset,borderRadius:L.windowRadius,overflow:'hidden',background:'#fff',boxShadow:'0 8px 16px rgba(80,57,113,.13)',color:'#253341'}}>
       <div data-t03-lights style={{position:'absolute',top:38,left:42,display:'flex',gap:8}}>{colors.map(c=><span key={c} style={{width:16,height:16,borderRadius:99,background:c,boxShadow:'inset 0 1px 1px rgba(255,255,255,.35)'}}/>)}</div>
       <div data-t03-text-display style={{position:'absolute',left:42,right:42,top:96,height:L.textDisplayHeight,borderRadius:25,background:'#fbfcfd',border:'1px solid rgba(54,78,97,.10)',overflow:'hidden'}}>
         <div data-t03-header style={{height:L.headerHeight,boxSizing:'border-box',padding:`0 ${L.bodyPadding}px`,display:'flex',alignItems:'center',borderBottom:'1px solid rgba(55,75,95,.10)',fontSize:L.fontSize*.72,whiteSpace:'pre',color:'#506172'}}>{header}</div>
         <div data-t03-body-clip style={{position:'absolute',left:L.bodyPadding,right:L.bodyPadding,top:L.headerHeight,bottom:L.ratio==='16:9'?55:0,overflow:'hidden',maskImage:s.scroll>0?'linear-gradient(to bottom, transparent 0, black 14%, black 90%, transparent 100%)':undefined,WebkitMaskImage:s.scroll>0?'linear-gradient(to bottom, transparent 0, black 14%, black 90%, transparent 100%)':undefined}}>
           <div data-t03-body style={{position:'absolute',left:0,right:0,top:(L.ratio==='16:9'?(s.lines.length===1?44:s.lines.length===2?28:10):Math.max(26,(L.bodyHeight-s.lines.length*L.lineHeight)/2))-s.scroll,fontSize:L.fontSize,lineHeight:`${L.lineHeight}px`,letterSpacing:'.01em'}}>{s.lines.map((line:string,i:number)=><div data-t03-line key={i} style={{width:s.widthFor(i),minHeight:L.lineHeight,overflowWrap:'break-word',opacity:s.fadedTop&&i===0?.41:1}}>{line||' '}</div>)}</div>
         </div>
       </div>
       <div style={{position:'absolute',left:0,right:0,top:L.keyboardTop,height:L.keyboardHeight,zIndex:3}}><Keyboard frame={s.visualFrame} typing={s.typing} ratio={L.ratio}/></div>
     </div>
   </div>
 </AbsoluteFill>;
};
