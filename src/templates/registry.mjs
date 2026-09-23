// Explicit registration; T01 default routing and locked source stay unchanged.
export const templateRegistry=Object.freeze({
  't01-reference-research-console':{id:'t01-reference-research-console',ratios:['9:16','1:1','16:9'],productionEnabled:true},
  't02-paper-dialogue':{id:'t02-paper-dialogue',ratios:['9:16','1:1','16:9'],productionEnabled:true,productionValidationCandidate:true,status:'9:16 / 1:1 / 16:9 Preview Approved; Production Validated'},
  't03-keyflow':{id:'t03-keyflow',ratios:['9:16','16:9'],productionEnabled:true,productionValidationCandidate:true,status:'Engineering complete; Production Validated'},
});
export function requirePreviewTemplate(id,ratio='9:16') {
  const item=templateRegistry[id];
  if(!item)throw Error(`Renderer for template ${id} is not implemented yet.`);
  if(!item.ratios.includes(ratio))throw Error(`${id}: ratio ${ratio} is not enabled.`);
  return item;
}
export function requireProductionTemplate(id,ratio='9:16',{allowCandidate=false}={}) {
  const item=requirePreviewTemplate(id,ratio);
  if(!item.productionEnabled && !(allowCandidate && item.productionValidationCandidate))throw Error(`${id}: production rendering is not enabled.`);
  return item;
}
