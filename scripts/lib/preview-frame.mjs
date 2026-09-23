export const chooseRepresentativeFrame = (timeline, startFrame = 0, endFrameExclusive = null) => {
  const start = Math.max(0, Number(startFrame) || 0);
  const end = Math.min(Number(timeline.durationInFrames ?? 1), endFrameExclusive == null ? Number(timeline.durationInFrames ?? 1) : Number(endFrameExclusive));
  const candidates = [];
  for (const m of timeline.messages ?? []) {
    if (m.speaker !== 'assistant') continue;
    const rs = Number(m.revealStartFrame ?? 0);
    const rd = Number(m.revealFrames ?? 24);
    const f = rs + Math.max(1, Math.floor(rd * 0.72));
    if (f >= start && f < end) candidates.push(f);
  }
  if (candidates.length) return candidates[candidates.length - 1];
  return start + Math.max(0, Math.floor((end - start - 1) / 2));
};
