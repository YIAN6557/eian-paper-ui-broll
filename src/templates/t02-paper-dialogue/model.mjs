import {layoutForRatio} from './layout.mjs';
import {animation as A,clamp01,ease} from './animation.mjs';
export function phraseEnds(text) {
  const units=text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*\s*|[^\x00-\x7F]|[\s\S]/gu)??[];
  let count=0,words=0,cjk=0;const ends=[];
  for(const unit of units) {
    count+=unit.length;
    if(/[A-Za-z0-9]/.test(unit))words++;
    if(/\p{Script=Han}/u.test(unit))cjk++;
    if(/[，。！？；,.!?;：:]/u.test(unit)||words>=A.phraseWords||cjk>=A.phraseCJK) {
      ends.push(count);words=0;cjk=0;
    }
  }
  if(ends.at(-1)!==text.length)ends.push(text.length);
  return ends;
}
// Immutable line break map. Only the current prefix is ever mounted in the DOM.
// Measurements and rendering use the same loaded font, weight and size.
export const forbiddenLineStartPunctuation = new Set(Array.from('，。？！：；、）》」】,.!?;:'));
const isWhitespace=(value)=>/^\s+$/u.test(value);
const isForbiddenLineStart=(value)=>Boolean(value)&&forbiddenLineStartPunctuation.has(Array.from(value)[0]);

// Immutable line break map. Only the current prefix is ever mounted in the DOM.
// Measurements and rendering use the same loaded font, weight and size.
// Kinsoku rule: closing punctuation must not become the first visible glyph of
// a wrapped line. When a closer would overflow, carry the preceding text unit
// (CJK glyph or Latin word) with it onto the next line instead of allowing the
// punctuation to lead the line.
export function wrapLines(text,maxWidth,measure) {
  const rawTokens=[...text.matchAll(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*|\s+|[^\x00-\x7F]|[\s\S]/gu)];
  const units=[];
  for(const match of rawTokens) {
    const value=match[0];const tokenStart=match.index??0;
    // Preserve explicit newlines as hard boundaries; other whitespace stays a
    // normal unit so existing trimEnd/render behavior remains unchanged.
    if(value.includes('\n')) {
      let offset=0;let chunkStart=0;
      for(const ch of value) {
        const next=offset+ch.length;
        if(ch==='\n') {
          if(offset>chunkStart)units.push({text:value.slice(chunkStart,offset),start:tokenStart+chunkStart,end:tokenStart+offset});
          units.push({text:'\n',start:tokenStart+offset,end:tokenStart+next,newline:true});
          chunkStart=next;
        }
        offset=next;
      }
      if(offset>chunkStart)units.push({text:value.slice(chunkStart,offset),start:tokenStart+chunkStart,end:tokenStart+offset});
      continue;
    }
    // Keep Latin words intact unless a single token itself is wider than the
    // available line; then preserve the previous character-level fallback.
    if(!isWhitespace(value)&&measure(value)>maxWidth) {
      let offset=0;
      for(const ch of value){const next=offset+ch.length;units.push({text:ch,start:tokenStart+offset,end:tokenStart+next});offset=next;}
    } else units.push({text:value,start:tokenStart,end:tokenStart+value.length});
  }

  const lines=[];let lineStart=0;let lineUnits=[];
  const pushCurrent=()=>{
    if(!lineUnits.length)return;
    const last=lineUnits.at(-1);
    if(last&&last.end>lineStart)lines.push({start:lineStart,end:last.end});
    lineUnits=[];
  };
  const startNewAt=(index)=>{lineStart=index;lineUnits=[];};

  for(const unit of units) {
    if(unit.newline) {pushCurrent();startNewAt(unit.end);continue;}
    if(!lineUnits.length&&isWhitespace(unit.text)) {lineStart=unit.end;continue;}
    const candidateStart=lineUnits.length?lineStart:unit.start;
    const candidateEnd=unit.end;
    const overflow=lineUnits.length>0&&!isWhitespace(unit.text)&&measure(text.slice(candidateStart,candidateEnd))>maxWidth;
    if(!overflow) {
      if(!lineUnits.length)lineStart=unit.start;
      lineUnits.push(unit);continue;
    }

    if(isForbiddenLineStart(unit.text)) {
      // Move the last meaningful unit from the current line together with the
      // closer. This prevents the closer from leading the next wrapped line
      // without widening the bubble or changing the configured max width.
      let carryIndex=lineUnits.length-1;
      while(carryIndex>=0&&isWhitespace(lineUnits[carryIndex].text))carryIndex--;
      if(carryIndex>=0) {
        const carryStart=lineUnits[carryIndex].start;
        const previous=lineUnits.slice(0,carryIndex);
        if(previous.length) {
          const previousEnd=previous.at(-1).end;
          lines.push({start:lineStart,end:previousEnd});
          lineStart=carryStart;
          lineUnits=lineUnits.slice(carryIndex);
          // carry + closer should normally fit because an oversize Latin word
          // was already split above. Keep a defensive fallback for tiny widths.
          if(measure(text.slice(lineStart,unit.end))<=maxWidth) {lineUnits.push(unit);continue;}
        }
      }
    }

    pushCurrent();
    startNewAt(unit.start);
    if(isWhitespace(unit.text)) {lineStart=unit.end;continue;}
    lineUnits.push(unit);
  }
  pushCurrent();
  return lines.length?lines:[{start:0,end:0}];
}
export function prepare(timeline,measure) {
  const ratio=timeline.ratio??'9:16';
  const L=layoutForRatio(ratio);
  if((timeline.fps??24)!==24)throw Error('T02_REQUIRES_24_FPS');
  const lastEnd=Math.max(1,...timeline.messages.map(m=>m.speaker==='user'?(m.startFrame??0)+(m.enterFrames??6):(m.revealStartFrame??0)+(m.revealFrames??24)));
  if((timeline.durationInFrames??0)<lastEnd+24)throw Error('T02_REQUIRES_FINAL_24_FRAME_HOLD');
  const messages=timeline.messages.map(m=>({...m,lines:wrapLines(m.text,(m.speaker==='user'?L.userMaxWidth:L.aiMaxWidth)-2*L.padX,measure),ends:phraseEnds(m.text)}));
  const history=[];const previousHeights=new Map();
  for(let frame=0;frame<=lastEnd;frame++) {
    const blocks=[];let y=0;
    for(const m of messages) {
      const user=m.speaker==='user';const start=user?(m.startFrame??0):(m.typingStartFrame??0);
      if(frame<start)continue;
      const rs=m.revealStartFrame??start+12,rd=m.revealFrames??24;
      const progress=clamp01((frame-rs)/Math.max(1,rd-A.settleFrames));
      const n=user?m.text.length:frame<rs?0:(m.ends[Math.min(m.ends.length-1,Math.floor(progress*m.ends.length))]??0);
      const lines=m.lines.filter(l=>n>l.start).map(l=>m.text.slice(l.start,Math.min(l.end,n)).trimEnd());
      const widths=lines.map(measure),maxWidth=user?L.userMaxWidth:L.aiMaxWidth;
      const fluidOneByOneAI=(ratio==='1:1'||ratio==='16:9')&&!user;
      // 1:1 / 16:9 Preview Candidate correction: before the first streamed text is visible,
      // the AI text bubble itself occupies no preallocated body box. At the first
      // visible phrase it is exactly one current-content line tall, then width/height
      // continue to follow only the text that has actually appeared.
      const showBubble=!fluidOneByOneAI||n>0;
      const width=!showBubble?2*L.padX:(n===0?2*L.padX:Math.min(maxWidth,lines.length>1&&!user?maxWidth:Math.max(0,...widths)+2*L.padX));
      const target=showBubble?2*L.padY+Math.max(1,lines.length)*L.lineHeight:0;
      let bodyHeight=0;
      if(showBubble) {
        let record=previousHeights.get(m.id);
        if(!record)record={from:target,to:target,at:frame};
        const old=record.from+(record.to-record.from)*ease((frame-record.at)/A.growthFrames);
        if(record.to!==target)record={from:old,to:target,at:frame};
        previousHeights.set(m.id,record);
        bodyHeight=record.from+(record.to-record.from)*ease((frame-record.at)/A.growthFrames);
      }
      const metaGap=!user&&showBubble?L.metaGap:0;
      const height=bodyHeight+(user?0:metaGap+L.metaHeight);
      const duration=((rs-start+rd)/24).toFixed(1);
      blocks.push({id:m.id,user,y,width,bodyHeight,height,lines,shown:n,text:m.text,opacity:1,showBubble,metaGap,
        enterY:user?4*(1-ease((frame-start)/A.userEnter)):0,
        duration,statusActive:!user&&frame<rs+rd});
      y+=height+L.gap;
    }
    const contentHeight=Math.max(0,y-L.gap);
    const cardHeight=Math.min(L.safeBottom-L.safeTop,Math.max(L.minCardHeight,contentHeight+2*L.padding));
    const cardTop=Math.max(L.safeTop,Math.min((L.height-cardHeight)/2,L.safeBottom-cardHeight));
    const overflow=Math.max(0,contentHeight-(cardHeight-2*L.padding));
    blocks.forEach((b)=>{
      b.screenY=L.padding+b.y-overflow;
      // Opacity is now applied per pixel by the fixed top fade-out zone.
      // Keeping model opacity at 1 preserves every existing movement and timing value.
      b.opacity=1;
    });
    history.push({frame,cardHeight,cardTop,contentHeight,overflow,blocks});
  }
  return {lastEnd,history};
}
export const stateAt=(model,globalFrame)=>model.history[Math.max(0,Math.min(Math.floor(globalFrame),model.lastEnd))];
