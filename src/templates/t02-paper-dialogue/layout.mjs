// Ratio calibration values for T02 Preview Candidates.
// Visual language stays inherited from the approved Native 9:16 template;
// only canvas/card proportions and ratio-specific safe widths adapt.
const shared=Object.freeze({
  cardWidth:864,padding:48,minCardHeight:222,radius:36,gap:30,
  aiMaxWidth:700,padX:30,padY:23,
  fontSize:34,lineHeight:54,metaSize:21,metaHeight:33,metaGap:15,
  userFill:'#484744',userText:'#FAF9F6',aiFill:'#EEEAE2',body:'#141413',
  muted:'#7E7972',paper:'#F8F6F0',card:'#FFFFFF',dot:'#E63946',
  shadow:'0 14px 42px rgba(48,46,39,0.13)',fontFamily:'T02 Noto Sans SC',
});
const layouts=Object.freeze({
  '9:16':Object.freeze({...shared,width:1080,height:1920,safeTop:174,safeBottom:1746,userMaxWidth:584}),
  '1:1':Object.freeze({...shared,width:1080,height:1080,safeTop:108,safeBottom:972,userMaxWidth:620}),
  '16:9':Object.freeze({...shared,width:1920,height:1080,cardWidth:1536,safeTop:108,safeBottom:972,userMaxWidth:720,aiMaxWidth:900}),
});
export const layoutForRatio=(ratio='9:16')=>{
  const item=layouts[ratio];
  if(!item)throw Error(`T02_RATIO_NOT_ENABLED:${ratio}`);
  return item;
};
// Backward-compatible 9:16 export for existing validation scripts.
export const layout=layouts['9:16'];
export const ratioLayouts=layouts;
