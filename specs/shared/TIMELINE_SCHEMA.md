# Timeline Data Model v1 — T01 Reference Profile

## Authority

This page explains timeline semantics for the T01 reference profile. The machine-readable [timeline.schema.json](../../src/timeline/timeline.schema.json) defines serialized fields and types; [timeline-compiler.mjs](../../scripts/lib/timeline-compiler.mjs) and [timeline-segmenter.mjs](../../scripts/lib/timeline-segmenter.mjs) execute compilation and segmentation. User-facing input and delivery behavior belongs to the [Skill production contract](../../docs/architecture/skill-production-contract.md).

Dialogue is parsed and compiled into this structure before Remotion renders frames.

## T01 reference invariants

- `fps` is 24.
- The default ratio is `9:16`; the T01 reference layout is 1080×1920 final and 720×1280 Preview.
- A user message appears as complete text and bubble using `startFrame` and `enterFrames`.
- An assistant message has a typing phase of 0.5–1.0 seconds, followed by a 2–4-character chunk reveal.
- The final visual state holds for 24 frames.
- Timeline compilation can exceed 8 seconds. When `meta.requiresSegmentation=true`, the segmenter slices the continuous state without restarting the T01 layout.

## Shape

```json
{
  "schemaVersion": "1.0",
  "ratio": "9:16",
  "fps": 24,
  "template": "t01-reference-research-console",
  "background": "b01-matte-paper",
  "taskText": "Review the conversation and return a clear response.",
  "taskMeta": "20 MIN ELAPSED",
  "statusDescription": "Analyzing conversation",
  "bottomStatusDescription": "Response ready",
  "messages": [
    {
      "id": "m1",
      "speaker": "user",
      "name": null,
      "text": "What can I create with this skill?",
      "startFrame": 0,
      "enterFrames": 6
    },
    {
      "id": "m2",
      "speaker": "assistant",
      "name": null,
      "text": "Provide a conversation and the skill turns it into a Paper UI B-roll video.",
      "typingStartFrame": 13,
      "typingFrames": 18,
      "revealStartFrame": 31,
      "revealFrames": 18
    }
  ],
  "holdFrames": 24,
  "durationInFrames": 73,
  "meta": {
    "generatedBy": "eian-paper-ui-broll/dialogue-to-timeline",
    "messageCount": 2,
    "requiresSegmentation": false,
    "maxPartFrames": 192
  }
}
```

## Internal segmentation manifest

The segmenter consumes the compiled global timeline and records contiguous slices with `continuityMode: "global-frame-slice"`. A later slice renders from its recorded `globalStartFrame`, preserving the same animated state rather than restarting the T01 composition.

```json
{
  "schemaVersion": "1.0",
  "fps": 24,
  "continuityMode": "global-frame-slice",
  "sourceDurationInFrames": 277,
  "minPartFrames": 72,
  "maxPartFrames": 192,
  "partCount": 2,
  "parts": [
    {
      "part": 1,
      "globalStartFrame": 0,
      "globalEndFrameExclusive": 159,
      "durationInFrames": 159,
      "durationSeconds": 6.625,
      "startsWithCarryOver": false,
      "isFinal": false,
      "cutReason": "turn-start"
    }
  ]
}
```

The segmenter prefers semantic boundaries such as a new user turn and uses a frame slice when needed to remain within the internal 3–8 second window. It does not insert a visual restart.
