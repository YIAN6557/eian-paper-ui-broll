export type Speaker = 'user' | 'assistant';

export type TimelineMessage = {
  id: string;
  speaker: Speaker;
  name?: string | null;
  text: string;
  startFrame?: number;
  enterFrames?: number;
  typingStartFrame?: number;
  typingFrames?: number;
  revealStartFrame?: number;
  revealFrames?: number;
};

export type Timeline = {
  schemaVersion?: '1.0';
  ratio?: '9:16' | '16:9' | '1:1';
  fps?: 24;
  template?: string;
  background?: string;
  taskText?: string;
  taskMeta?: string;
  statusDescription?: string;
  bottomStatusDescription?: string;
  messages: TimelineMessage[];
  holdFrames?: number;
  durationInFrames?: number;
  meta?: {
    generatedBy?: string;
    messageCount?: number;
    requiresSegmentation?: boolean;
    maxPartFrames?: number;
  };
};

export type TimelinePart = {
  part: number;
  globalStartFrame: number;
  globalEndFrameExclusive: number;
  durationInFrames: number;
  durationSeconds: number;
  startsWithCarryOver: boolean;
  isFinal: boolean;
  cutReason: string;
  stateAtStart?: {
    visibleMessageIds: string[];
    activeTypingMessageId: string | null;
    activeRevealMessageId: string | null;
  };
};

export type SegmentationManifest = {
  schemaVersion: '1.0';
  fps: 24;
  continuityMode: 'global-frame-slice';
  sourceDurationInFrames: number;
  minPartFrames: number;
  maxPartFrames: number;
  targetPartFrames?: number;
  partCount: number;
  parts: TimelinePart[];
};
