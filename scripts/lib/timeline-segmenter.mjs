const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

const boundaryMapFor = (timeline) => {
  const map = new Map();
  const add = (frame, type) => {
    const f = Math.round(frame);
    if (!Number.isFinite(f) || f < 0 || f > timeline.durationInFrames) return;
    if (!map.has(f)) map.set(f, new Set());
    map.get(f).add(type);
  };
  add(0, 'timeline-start');
  add(timeline.durationInFrames, 'timeline-end');
  for (const m of timeline.messages ?? []) {
    if (m.speaker === 'user') {
      add(m.startFrame ?? 0, 'turn-start');
      add((m.startFrame ?? 0) + (m.enterFrames ?? 0), 'user-enter-end');
    } else {
      add(m.typingStartFrame ?? 0, 'assistant-typing-start');
      add(m.revealStartFrame ?? 0, 'assistant-reveal-start');
      add((m.revealStartFrame ?? 0) + (m.revealFrames ?? 0), 'assistant-reveal-end');
    }
  }
  return map;
};

const boundaryPenalty = (types, isFinal) => {
  if (isFinal) return 0;
  if (!types) return 28; // hard slice: still allowed to preserve exact 3–8 s bounds.
  if (types.has('turn-start')) return 0;
  if (types.has('assistant-reveal-end')) return 4;
  if (types.has('assistant-typing-start')) return 8;
  if (types.has('user-enter-end')) return 10;
  if (types.has('assistant-reveal-start')) return 14;
  return 18;
};

const messageStateAtFrame = (timeline, frame) => {
  const visibleMessageIds = [];
  let activeTypingMessageId = null;
  let activeRevealMessageId = null;
  for (const m of timeline.messages ?? []) {
    if (m.speaker === 'user') {
      if ((m.startFrame ?? 0) <= frame) visibleMessageIds.push(m.id);
      continue;
    }
    const ts = m.typingStartFrame ?? 0;
    const rs = m.revealStartFrame ?? ts + (m.typingFrames ?? 0);
    const re = rs + (m.revealFrames ?? 0);
    if (frame >= ts) visibleMessageIds.push(m.id);
    if (frame >= ts && frame < rs) activeTypingMessageId = m.id;
    if (frame >= rs && frame < re) activeRevealMessageId = m.id;
  }
  return {visibleMessageIds, activeTypingMessageId, activeRevealMessageId};
};

export const segmentTimeline = (timeline, options = {}) => {
  const fps = Number(timeline.fps ?? 24);
  if (fps !== 24) throw new Error('V1 segmenter is locked to 24fps.');
  const minFrames = Math.round(fps * Number(options.minSeconds ?? 3));
  const maxFrames = Math.round(fps * Number(options.maxSeconds ?? 8));
  const targetFrames = Math.round(fps * Number(options.targetSeconds ?? 6.25));
  const total = Number(timeline.durationInFrames ?? 0);
  if (!Number.isFinite(total) || total <= 0) throw new Error('Timeline durationInFrames must be positive.');

  if (total <= maxFrames) {
    return {
      schemaVersion: '1.0',
      fps,
      continuityMode: 'global-frame-slice',
      sourceDurationInFrames: total,
      minPartFrames: minFrames,
      maxPartFrames: maxFrames,
      partCount: 1,
      parts: [{
        part: 1,
        globalStartFrame: 0,
        globalEndFrameExclusive: total,
        durationInFrames: total,
        durationSeconds: Number((total / fps).toFixed(3)),
        startsWithCarryOver: false,
        isFinal: true,
        cutReason: 'timeline-end',
        stateAtStart: messageStateAtFrame(timeline, 0),
      }],
    };
  }

  const boundaries = boundaryMapFor(timeline);
  const INF = Number.POSITIVE_INFINITY;
  const dp = Array(total + 1).fill(INF);
  const prev = Array(total + 1).fill(-1);
  dp[0] = 0;

  for (let end = minFrames; end <= total; end++) {
    const lo = Math.max(0, end - maxFrames);
    const hi = end - minFrames;
    for (let start = lo; start <= hi; start++) {
      if (!Number.isFinite(dp[start])) continue;
      const len = end - start;
      const lengthCost = Math.pow((len - targetFrames) / fps, 2) * 1.8;
      const semPenalty = boundaryPenalty(boundaries.get(end), end === total);
      // Slightly prefer not to slice inside an active reveal/typing state.
      const state = messageStateAtFrame(timeline, end);
      const activePenalty = end === total ? 0 : (state.activeTypingMessageId ? 10 : state.activeRevealMessageId ? 7 : 0);
      const cost = dp[start] + lengthCost + semPenalty + activePenalty;
      if (cost < dp[end]) {
        dp[end] = cost;
        prev[end] = start;
      }
    }
  }

  if (prev[total] < 0) {
    throw new Error(`Unable to segment ${total} frames into ${minFrames}–${maxFrames} frame parts.`);
  }

  const cuts = [total];
  let cur = total;
  while (cur > 0) {
    cur = prev[cur];
    if (cur < 0) throw new Error('Internal segmentation backtrack failure.');
    cuts.push(cur);
  }
  cuts.reverse();

  const parts = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const start = cuts[i];
    const end = cuts[i + 1];
    const types = boundaries.get(end);
    const reason = end === total ? 'timeline-end' : types ? [...types].sort().join('+') : 'hard-global-slice';
    parts.push({
      part: i + 1,
      globalStartFrame: start,
      globalEndFrameExclusive: end,
      durationInFrames: end - start,
      durationSeconds: Number(((end - start) / fps).toFixed(3)),
      startsWithCarryOver: start > 0,
      isFinal: end === total,
      cutReason: reason,
      stateAtStart: messageStateAtFrame(timeline, start),
    });
  }

  return {
    schemaVersion: '1.0',
    fps,
    continuityMode: 'global-frame-slice',
    sourceDurationInFrames: total,
    minPartFrames: minFrames,
    maxPartFrames: maxFrames,
    targetPartFrames: targetFrames,
    partCount: parts.length,
    parts,
  };
};
