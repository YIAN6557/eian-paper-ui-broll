export const animation = Object.freeze({userEnter:4, growthFrames:6, settleFrames:8,
  phraseWords:4, phraseCJK:8,
  // Preview Candidate calibration only. This is not a locked template rule.
  fadeOutZoneHeight:48});
export const clamp01 = (v) => Math.max(0,Math.min(1,v));
export const ease = (v) => 1-Math.pow(1-clamp01(v),3);

export const fadeOutOpacityAtY = (y) => clamp01(y/animation.fadeOutZoneHeight);
export const fadeOutMask = (active) => active
  ? `linear-gradient(to bottom, transparent 0px, #000 ${animation.fadeOutZoneHeight}px)`
  : 'none';
