const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

const visibleLength = (text) => [...String(text ?? '')].length;

export const typingFramesFor = (text, fps = 24) => {
  const n = visibleLength(text);
  // Locked rule: 0.5–1.0 s, length-adaptive, even for very short replies.
  const min = Math.round(fps * 0.5);
  const max = Math.round(fps * 1.0);
  return clamp(min + Math.round(n / 45) * 3, min, max);
};

export const revealFramesFor = (text, fps = 24) => {
  const n = visibleLength(text);
  // Fast 2–4-character chunk reveal. The duration adapts to length but remains brisk.
  const estimated = Math.ceil(n / 4.4);
  return clamp(estimated, Math.round(fps * 0.5), Math.round(fps * 1.6));
};

export const compileTimeline = (messages, options = {}) => {
  const fps = Number(options.fps ?? 24);
  const ratio = options.ratio ?? '9:16';
  if (!['9:16', '16:9', '1:1'].includes(ratio)) throw new Error(`Unsupported ratio: ${ratio}`);
  if (fps !== 24) throw new Error('V1 timeline compiler is locked to 24fps.');

  const out = [];
  const userEnterFrames = 6;
  const shortGap = 7;       // ≈0.29 s user -> AI typing
  const turnGap = 13;       // ≈0.54 s after a completed turn
  let cursor = 0;

  for (const message of messages) {
    if (message.speaker === 'user') {
      out.push({
        ...message,
        startFrame: cursor,
        enterFrames: userEnterFrames,
      });
      cursor += userEnterFrames + shortGap;
      continue;
    }

    const typingFrames = typingFramesFor(message.text, fps);
    const revealFrames = revealFramesFor(message.text, fps);
    const typingStartFrame = cursor;
    const revealStartFrame = typingStartFrame + typingFrames;
    out.push({
      ...message,
      typingStartFrame,
      typingFrames,
      revealStartFrame,
      revealFrames,
    });
    cursor = revealStartFrame + revealFrames + turnGap;
  }

  const holdFrames = 24; // locked: final state holds exactly 1 second.
  const lastEventEnd = out.reduce((max, m) => {
    if (m.speaker === 'user') return Math.max(max, (m.startFrame ?? 0) + (m.enterFrames ?? 0));
    return Math.max(max, (m.revealStartFrame ?? 0) + (m.revealFrames ?? 0));
  }, 0);
  const durationInFrames = lastEventEnd + holdFrames;
  const maxPartFrames = fps * 8;

  return {
    schemaVersion: '1.0',
    ratio,
    fps,
    template: options.template ?? 't01-reference-research-console',
    background: options.background ?? 'b01-matte-paper',
    taskText: options.taskText ?? 'Review the conversation and return a clear response.',
    taskMeta: options.taskMeta ?? '20 MIN ELAPSED',
    statusDescription: options.statusDescription ?? 'Analyzing conversation',
    bottomStatusDescription: options.bottomStatusDescription ?? 'Response ready',
    messages: out,
    holdFrames,
    durationInFrames,
    meta: {
      generatedBy: 'eian-paper-ui-broll/dialogue-to-timeline',
      messageCount: out.length,
      requiresSegmentation: durationInFrames > maxPartFrames,
      maxPartFrames,
    },
  };
};
