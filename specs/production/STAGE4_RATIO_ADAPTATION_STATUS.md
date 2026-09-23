# Stage 4 — Ratio Adaptation Status

Status: **Production Validated / Completed**

## Scope
- Preserve locked `T01 Native 9:16 V7`.
- Add `1:1` and `16:9` through ratio parameters, not duplicated templates.
- Reuse Stage 3 Background System unchanged.

## Minimal implementation
1. `src/Root.tsx`: Remotion production dimensions come from `timeline.ratio`.
2. `scripts/lib/background-system.mjs`: adds ratio-specific preview dimensions.
3. `scripts/preview-job.mjs`: Remotion still dimensions follow Job ratio.
4. `scripts/preview.mjs`: simple preview command follows Timeline ratio.
5. `scripts/lib/workflow-state.mjs`: Preview State stores ratio-specific resolution.
6. `src/components/MainCard.tsx`: one `maxWidth:1180` cap; 9:16 and 1:1 remain below the cap, so only 16:9 is constrained.
7. `scripts/test-stage4-ratios.mjs`: ratio/crop/state regression.
8. `scripts/validate-stage4-ratios.mjs`: one-command Remotion production gate.
9. User bubbles use content-driven width with ratio-specific safe maximums (`9:16` 620px, `1:1` 620px, `16:9` 720px); wrapping begins only after the natural text width exceeds that ceiling. AI bubbles are unchanged.
10. The 9:16 reference renderer was corrected from the historical fixed large minimum width to the equivalent content-driven rule at its 720p validation scale (`413px` safe maximum).
11. `scripts/test-user-bubble-width.mjs` protects the rule from regressing to `minWidth:80%` / fixed large minimum-width behavior.
12. The full T01 visual frame is clamped to the final message event during the 24-frame hold, so dots, rails, bubbles and reveal state remain unchanged for exactly 1 second.
13. `scripts/test-final-hold.mjs` protects the final-hold freeze rule in both Remotion and the 9:16 reference renderer.

## Chat-side validation
- Stage 4 ratio parameterization: PASS
- Parser regression: PASS
- Segmentation regression: PASS
- Workflow regression: PASS
- Stage 3 Background regression: PASS
- User bubble safe-width regression: PASS
- 9:16 short / medium / long visual bubble regression: PASS
- 1:1 V3 visual review: PASS — user approved
- 16:9 V3 visual review: PASS — user approved
- Three-ratio H.264 Chat-rendered final gate: PASS
- Final 24 raw frames pixel-identical on all three ratios: PASS
- Accepted 1:1 / 16:9 V3 previews unchanged after hold fix: PASS

The Chat-side validation remains historical pre-production evidence only. Formal local Remotion production validation completed on 2026-09-05.

## Production validation command
```bash
npm install
npm run doctor
npm run validate:stage4
```

The production gate checks:
- 9:16 Remotion Preview regression against an immutable Preview extracted from the supplied Stage 3 production-validated archive; the only permitted difference is the explicitly approved user-bubble correction;
- 1:1 Preview `720×720` + H.264 MP4 `1080×1080`;
- 16:9 Preview `1280×720` + H.264 MP4 `1920×1080`;
- 24 fps / H.264;
- existing Parser / Segmentation / Workflow / Background regressions;
- raw-Remotion pixel identity across the final 24 frames for all three ratios.

## Formal production result

- `npm install`: PASS; 249 packages added, 0 vulnerabilities reported.
- `npm run doctor`: PASS — Node.js `v22.23.0`, npm `10.9.8`, FFmpeg `7.0.2-tessus`, Remotion dependencies installed.
- `npm run validate:stage4`: **10 PASS / 0 BLOCKED / 0 FAIL**.
- `npm run validate:production`: **10 PASS / 0 BLOCKED / 0 FAIL**; actual BG-P01, Solid, Paper, Image and Multi-Part Remotion output remains valid.
- The actual 1:1 / 16:9 Remotion compositions were retained without visual redesign; they remain consistent with the user-approved Chat compositions.

Final evidence:
- `validation/STAGE4_PRODUCTION_VALIDATION_REPORT.md`
- `validation/stage4-production-validation-manifest.json`
- `validation/stage4-ratio-validation-manifest.json`
- `validation/stage4-ratio-validation/`

Stage 4 is **Production Validated / Completed**. Do not start Stage 5 / T02.
