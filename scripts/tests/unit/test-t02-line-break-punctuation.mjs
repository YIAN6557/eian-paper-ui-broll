import assert from 'node:assert/strict';
import {wrapLines,forbiddenLineStartPunctuation} from '../../../src/templates/t02-paper-dialogue/model.mjs';

// Deterministic test metrics: T02's Noto Sans SC uses 34px CJK advances in the
// approved browser evidence. ASCII widths are only used to exercise mixed text.
const measure=(text)=>Array.from(text).reduce((sum,ch)=>{
  if(ch===' ')return sum+9;
  return sum+(/[^\x00-\x7F]/u.test(ch)?34:18);
},0);
const renderLines=(text,maxWidth)=>wrapLines(text,maxWidth,measure).map(({start,end})=>text.slice(start,end).trimEnd());
const hasForbiddenStart=(line)=>Boolean(line)&&forbiddenLineStartPunctuation.has(Array.from(line)[0]);

const ratios={
  '9:16':{user:584-60,assistant:700-60},
  '1:1':{user:620-60,assistant:700-60},
};
const chineseClosers=Array.from('，。？！：；、）》」】');
for(const [ratio,widths] of Object.entries(ratios)) {
  for(const [side,maxWidth] of Object.entries(widths)) {
    for(const punct of chineseClosers) {
      let exercised=false;
      for(let n=1;n<30;n++) {
        const text='测'.repeat(n)+punct+'甲';
        const lines=renderLines(text,maxWidth);
        assert(lines.every((line)=>!hasForbiddenStart(line)),`${ratio}/${side}: ${punct} must not lead a wrapped line: ${JSON.stringify(lines)}`);
        assert(lines.every((line)=>measure(line)<=maxWidth),`${ratio}/${side}: repaired line must stay within max width`);
        if(lines.length>1)exercised=true;
      }
      assert(exercised,`${ratio}/${side}: test must cross a wrap boundary for ${punct}`);
    }
  }
}

const mixed=[
  '如果我把 research workflow 交给 AI，第一步应该做什么？',
  '可以。重点不是语言统一，而是结构统一：保留 source metadata、时间、版本和引用位置。',
  'Put approval only at high-impact decisions：目标变化、风险判断、不可逆操作和 final delivery。',
];
for(const text of mixed) {
  for(const maxWidth of [524,560,640]) {
    const lines=renderLines(text,maxWidth);
    assert(lines.every((line)=>!hasForbiddenStart(line)),`mixed text must not lead with closing punctuation: ${JSON.stringify(lines)}`);
  }
}

console.log('T02 punctuation line-break checks: PASS');
