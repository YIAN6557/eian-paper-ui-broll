import React from 'react';
import type {Ratio} from '../config/layout';
import {userBubbleSafeMaxWidth} from '../config/layout';

export const MessageBubble: React.FC<{
  side: 'user' | 'assistant';
  text: string;
  name?: string | null;
  opacity?: number;
  translateX?: number;
  ratio?: Ratio;
}> = ({side, text, name, opacity = 1, translateX = 0, ratio = '9:16'}) => {
  const isUser = side === 'user';
  return (
    <div style={{
      display:'flex',
      flexDirection:'column',
      alignItems:isUser ? 'flex-end' : 'flex-start',
      opacity,
      transform:`translateX(${translateX}px)`,
      flexShrink:0,
    }}>
      {name ? <div style={{fontSize:16, color:'#77766f', marginBottom:5, paddingInline:8}}>{name}</div> : null}
      <div style={{
        width:isUser ? 'fit-content' : undefined,
        minWidth:undefined,
        maxWidth:isUser ? userBubbleSafeMaxWidth[ratio] : '76%',
        borderRadius:isUser ? 24 : 21,
        padding:isUser ? '15px 20px' : '14px 18px',
        background:isUser ? '#171716' : '#d9dad5',
        color:isUser ? '#faf9f6' : '#34332f',
        fontSize:20,
        lineHeight:1.32,
        letterSpacing:'-0.018em',
        whiteSpace:'pre-wrap',
        boxSizing:'border-box',
      }}>{text}</div>
    </div>
  );
};
