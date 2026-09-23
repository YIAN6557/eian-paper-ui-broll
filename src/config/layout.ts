export type Ratio = '9:16' | '16:9' | '1:1';

export const dimensions = {
  '9:16': {width: 1080, height: 1920},
  '16:9': {width: 1920, height: 1080},
  '1:1': {width: 1080, height: 1080},
} as const;

export const previewDimensions = {
  '9:16': {width: 720, height: 1280},
  '16:9': {width: 1280, height: 720},
  '1:1': {width: 720, height: 720},
} as const;

// User bubbles stay content-driven until they reach a ratio-specific safe
// reading width. Only then should text wrap to another line.
export const userBubbleSafeMaxWidth = {
  '9:16': 620,
  '1:1': 620,
  '16:9': 720,
} as const;

