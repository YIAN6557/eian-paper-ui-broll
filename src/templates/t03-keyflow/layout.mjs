const native = {
  '9:16': {width:1080,height:1920,cardWidth:860,cardHeight:1420,windowInset:4,angle:3,windowRadius:66,bodyTop:260,bodyHeight:700,keyboardTop:1030,keyboardHeight:294,fontSize:36,lineHeight:55,bodyPadding:54,headerHeight:104,maxLinesLow:8,typingStartFrame:24,typingEndPadding:12},
  // Approved 16:9 R7 uses exactly three visible safe rows. Their widths are
  // the locked 790 / 750 / 690 px geometry, expressed as ratios so the
  // canonical Remotion layout stays resolution-independent.
  '16:9': {width:1920,height:1080,cardWidth:1320,cardHeight:760,windowInset:4,angle:3,windowRadius:56,bodyTop:174,bodyHeight:325,textDisplayHeight:449,keyboardTop:454,keyboardHeight:260,fontSize:31,lineHeight:47,bodyPadding:48,headerHeight:88,maxLinesLow:3,typingStartFrame:14,typingEndPadding:12,revealExponent:.92,maxSafeVisibleLines:3,safeLineWidthFactors:[1,750/790,690/790]},
};
export const keyflowLayout = (ratio='9:16') => {
  const value=native[ratio];
  if (!value) throw new Error(`T03_RATIO_UNSUPPORTED:${ratio}`);
  return {...value, textDisplayHeight:value.textDisplayHeight ?? value.bodyTop+value.bodyHeight-105, cardLeft:(value.width-value.cardWidth)/2, cardTop:(value.height-value.cardHeight)/2, textWidth:value.cardWidth-value.windowInset*2-value.bodyPadding*2};
};
