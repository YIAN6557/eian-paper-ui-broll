import React,{useEffect,useMemo,useState} from 'react';
import {AbsoluteFill,continueRender,delayRender,cancelRender,staticFile,useCurrentFrame} from 'remotion';
import type {Timeline} from '../../timeline/types';
import {layoutForRatio} from './layout.mjs';
import {animation as A,fadeOutMask} from './animation.mjs';
import {prepare,stateAt} from './model.mjs';
let fontReady:Promise<void>|null=null;
function loadFont(fontFamily:string,fontSize:number){
  if(!fontReady)fontReady=(async()=>{
    const face=new FontFace(fontFamily,`url("${staticFile('fonts/t02/NotoSansSC.ttf')}")`,{weight:'400'});
    await face.load();document.fonts.add(face);await document.fonts.ready;
    if(!document.fonts.check(`400 ${fontSize}px "${fontFamily}"`,'复确关判'))throw Error('T02_SC_FONT_NOT_LOADED');
  })();
  return fontReady;
}
export const T02PaperDialogue:React.FC<{timeline:Timeline;globalStartFrame?:number;externalBackground?:boolean}>=({timeline,globalStartFrame=0,externalBackground=false})=>{
  const local=useCurrentFrame();
  const L=layoutForRatio(timeline.ratio??'9:16');
  const [handle]=useState(()=>delayRender('Load deterministic T02 Simplified Chinese font'));
  const [ready,setReady]=useState(false);
  useEffect(()=>{loadFont(L.fontFamily,L.fontSize).then(()=>{setReady(true);continueRender(handle);}).catch(cancelRender);},[handle,L.fontFamily,L.fontSize]);
  const model=useMemo(()=>{
    if(!ready)return null;
    const ctx=document.createElement('canvas').getContext('2d');if(!ctx)throw Error('CANVAS_MEASUREMENT_UNAVAILABLE');
    ctx.font=`400 ${L.fontSize}px "${L.fontFamily}"`;
    return prepare(timeline,(text:string)=>ctx.measureText(text).width);
  },[ready,timeline,L.fontFamily,L.fontSize]);
  useEffect(()=>{
    if(!model || process.env.T02_CAPTURE_EVIDENCE !== '1')return;
    const state=stateAt(model,local+globalStartFrame);
    const ctx=document.createElement('canvas').getContext('2d')!;
    ctx.font=`400 ${L.fontSize}px "${L.fontFamily}"`;
    const glyphWidths=Object.fromEntries(Array.from('复确关判').map(c=>[c,ctx.measureText(c).width]));
    const fadeLayer=document.querySelector('[data-t02-fade-out-zone]') as HTMLElement|null;
    const blocks=Array.from(document.querySelectorAll('[data-message-id]')).map(el=>{
      const bubble=el.querySelector('[data-t02-block]') as HTMLElement|null;
      return {id:el.getAttribute('data-message-id'),fill:bubble?getComputedStyle(bubble).backgroundColor:null,
        lines:Array.from(el.querySelectorAll('[data-t02-line]')).map(line=>{
          const range=document.createRange();range.selectNodeContents(line);
          const box=range.getBoundingClientRect();return {text:line.textContent,width:box.width,x:box.x};
        })};
    });
    const fadeOutZone={active:state.overflow>0,height:A.fadeOutZoneHeight,maskImage:fadeLayer?getComputedStyle(fadeLayer).maskImage:null};
    console.log('T02_EVIDENCE:'+JSON.stringify({rawFrame:local+globalStartFrame,...state,glyphWidths,fadeOutZone,dom:blocks}));
  },[model,local,globalStartFrame,L.fontFamily,L.fontSize]);
  if(!model)return null;
  const s=stateAt(model,local+globalStartFrame);
  if(typeof window!=='undefined')(window as any).__T02_EVIDENCE__={...s,lastEnd:model.lastEnd,fontReady:ready};
  return <AbsoluteFill lang="zh-CN" style={{background:externalBackground?'transparent':L.paper,fontFamily:`"${L.fontFamily}"`,fontWeight:400,fontSize:L.fontSize,lineHeight:`${L.lineHeight}px`,fontSynthesis:'none',color:L.body}}>
    {!externalBackground&&<AbsoluteFill style={{opacity:0.022,backgroundImage:'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'220\' height=\'220\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'.8\' numOctaves=\'3\' seed=\'17\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Cpath fill=\'%23594e41\' filter=\'url(%23n)\' d=\'M0 0h220v220H0z\'/%3E%3C/svg%3E")'}}/>}
    <div data-t02-card style={{position:'absolute',left:(L.width-L.cardWidth)/2,top:s.cardTop,width:L.cardWidth,height:s.cardHeight,borderRadius:L.radius,background:L.card,boxShadow:L.shadow,overflow:'hidden'}}>
      <div data-t02-fade-out-zone style={{position:'absolute',inset:0,WebkitMaskImage:fadeOutMask(s.overflow>0),maskImage:fadeOutMask(s.overflow>0),WebkitMaskRepeat:'no-repeat',maskRepeat:'no-repeat'}}>
        {s.blocks.map((b:any)=><div key={b.id} data-message-id={b.id} data-speaker={b.user?'user':'assistant'} style={{position:'absolute',left:b.user?L.cardWidth-L.padding-b.width:L.padding,top:b.screenY+b.enterY,width:b.width,opacity:b.opacity}}>
          {b.showBubble!==false&&<div data-t02-block style={{width:b.width,height:b.bodyHeight,boxSizing:'border-box',borderRadius:27,background:b.user?L.userFill:L.aiFill,color:b.user?L.userText:L.body,overflow:'hidden',padding:`${L.padY}px ${L.padX}px`}}>
            {b.lines.map((text:string,i:number)=><div data-t02-line key={i} style={{height:L.lineHeight,whiteSpace:'pre',fontKerning:'normal'}}>{text}</div>)}
          </div>}
          {!b.user&&<div data-t02-meta style={{marginTop:b.metaGap??L.metaGap,fontSize:L.metaSize,lineHeight:`${L.metaHeight}px`,height:L.metaHeight,color:L.muted,display:'flex',alignItems:'center',gap:12,whiteSpace:'nowrap'}}>
            <span style={{display:'inline-block',width:10,height:10,borderRadius:99,background:L.dot,opacity:b.statusActive?0.72+0.28*Math.sin(s.frame*Math.PI/24)**2:1}}/>
            <span>Thinking · {b.duration}s</span>
          </div>}
        </div>)}
      </div>
    </div>
  </AbsoluteFill>;
};
