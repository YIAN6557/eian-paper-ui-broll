const ascii = /[A-Za-z0-9]/;
const unitWidth = (char, fontSize) => ascii.test(char) ? fontSize * .54 : fontSize;
const TYPE_PATTERN=[2,3,2,2,3,3,2,3,2,2];
export const bodyText = (timeline) => timeline.messages.map((m) => m.text).join('\n').trim();
export const chunksFor = (text) => {
  const chunks=[]; let i=0;
  let patternIndex=0;
  while(i<text.length){ const size=/[\s,.!?，。！？]/.test(text[i]) ? 1 : TYPE_PATTERN[patternIndex++%TYPE_PATTERN.length]; chunks.push(text.slice(i,i+size)); i+=size; }
  return chunks;
};
export const revealedText = (text, frame, start=20, end=180, exponent=1) => {
  if(frame < start) return ''; const chunks=chunksFor(text); const progress=Math.max(0,Math.min(1,(frame-start)/Math.max(1,end-start)));
  return chunks.slice(0,Math.ceil(chunks.length*Math.pow(progress,exponent))).join('');
};
const words = (text) => text.match(/\S+|\s+/g) ?? [];
export const wrapKeyflow = (text, measure, maxWidth) => {
  const lines=[]; let line='';
  const push=()=>{if(line)lines.push(line.trimEnd());line='';};
  for(const token of words(text)){
    if(token==='\n'){push();continue;}
    if(measure(line+token)<=maxWidth){line+=token;continue;}
    if(/^\s+$/.test(token)){push();continue;}
    if(line && /[A-Za-z0-9]$/.test(line.trimEnd()) && /^[A-Za-z]/.test(token)){push();line=token;continue;}
    for(const char of token){if(measure(line+char)>maxWidth && line)push();line+=char;}
  } push(); return lines.length?lines:[''];
};
export const safeWidthForLine = (lineIndex, capacity, textWidth, ratio, factors) => {
  if (ratio !== '16:9') return textWidth;
  if (factors?.length) return textWidth*factors[Math.max(0,Math.min(factors.length-1,lineIndex))];
  const slot=Math.max(0, Math.min(capacity-1, lineIndex));
  // Only the lower perspective/keyboard zone loses meaningful width. The
  // upper body remains the normal full-width input plane from approved R7.
  const fromBottom=(capacity-1)-slot;
  const factor=fromBottom>=4?1:fromBottom===3?.965:fromBottom===2?.93:fromBottom===1?.84:.70;
  return textWidth*factor;
};
export const wrapKeyflowByVisibleLine = (text, measure, layout) => {
  const capacity=layout.maxSafeVisibleLines??Math.floor(layout.bodyHeight/layout.lineHeight)-1;
  let lines=[''];
  for(let pass=0;pass<6;pass++) {
    const scrollLines=Math.max(0,lines.length-capacity);
    const next=[];let line='';
    const push=()=>{if(line)next.push(line.trimEnd());line='';};
    for(const token of words(text)) {
      if(token==='\n'){push();continue;}
      const width=()=>safeWidthForLine(next.length-scrollLines,capacity,layout.textWidth,layout.ratio,layout.safeLineWidthFactors);
      if(measure(line+token)<=width()){line+=token;continue;}
      if(/^\s+$/.test(token)){push();continue;}
      if(line && /[A-Za-z0-9]$/.test(line.trimEnd()) && /^[A-Za-z]/.test(token)){push();line=token;continue;}
      for(const char of token){if(measure(line+char)>width() && line)push();line+=char;}
    }
    push(); if(!next.length)next.push('');
    if(JSON.stringify(next)===JSON.stringify(lines)) return {lines:next,capacity,scrollLines:Math.max(0,next.length-capacity)};
    lines=next;
  }
  return {lines,capacity,scrollLines:Math.max(0,lines.length-capacity)};
};
export const stateAt = (timeline, layout, frame) => {
  const hold=Math.max(24,timeline.holdFrames??24); const frozen=Math.max(0,(timeline.durationInFrames??204)-hold);
  const visualFrame=Math.min(frame,frozen); const text=bodyText(timeline);
  const typingStart=layout.typingStartFrame??22; const typingEnd=Math.max(typingStart+1,frozen-(layout.typingEndPadding??16));
  const visible=revealedText(text,visualFrame,typingStart,typingEnd,layout.revealExponent??1);
  const measure=(s)=>Array.from(s).reduce((w,c)=>w+unitWidth(c,layout.fontSize),0);
  const wrapped=wrapKeyflowByVisibleLine(visible,measure,layout);
  const preScrolled=layout.ratio==='16:9'&&wrapped.scrollLines>0;
  const lines=preScrolled?wrapped.lines.slice(-wrapped.capacity):wrapped.lines;
  const widthFor=(lineIndex)=>safeWidthForLine(lineIndex,wrapped.capacity,layout.textWidth,layout.ratio,layout.safeLineWidthFactors);
  const scroll=preScrolled?0:wrapped.scrollLines*layout.lineHeight;
  return {visualFrame,visible,lines,scroll,capacity:wrapped.capacity,fadedTop:preScrolled,widthFor,typing:visualFrame>=typingStart&&visualFrame<typingEnd};
};
