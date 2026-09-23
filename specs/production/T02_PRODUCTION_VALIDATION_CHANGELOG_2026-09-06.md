# T02 Production Validation Changelog — 2026-09-06

## Production Validation preflight patch applied

The verified patch added or updated the following Production Validation integration files:

- `src/templates/registry.mjs`
- `scripts/preview-job.mjs`
- `scripts/render-job.mjs`
- `scripts/workflow.mjs`
- `scripts/lib/template-timing.mjs`
- `scripts/test-t02-production-routing.mjs`
- `scripts/validate-t02-production.mjs`
- `validation/t02-production-validation-manifest.json`
- `validation/t02-production-source-hash-check.json`
- `logs/t02-production-preflight.diff`

The patch keeps `productionEnabled: false` and allows T02 formal rendering only when `--validation-candidate` is explicit.

## Validation-run corrections

Two integration corrections were necessary to satisfy the locked Production Validation contract:

1. `scripts/workflow.mjs` now applies the existing T02 template-timing adapter on global template selection only. This correctly gives T02 1:1 and 16:9 their approved eight-frame empty-card intro, shifts all downstream timings, and re-segments the timeline. The two-Part template-change exception remains excluded from global retiming.
2. `scripts/render-job.mjs` now uses the T02 validation-candidate path to render a complete native Remotion PNG sequence and encode it as H.264 / yuv420p at 24 fps with all-intra frames. This preserves the required decoded final 24-frame freeze. The path is limited to `t02-paper-dialogue` plus `--validation-candidate`; all non-T02 production routes, including T01, retain their previous renderer path.

## Locked visual surface

No T01 or T02 visual component, layout, animation, or model was changed during this run. In particular, these T02 visual files remain unchanged from the approved candidate:

- `src/templates/t02-paper-dialogue/T02PaperDialogue.tsx`
- `src/templates/t02-paper-dialogue/layout.mjs`
- `src/templates/t02-paper-dialogue/animation.mjs`
- `src/templates/t02-paper-dialogue/model.mjs`

The 157-frame T01 regression passed after all changes.

## Result and boundaries

The final manifest is PASS with 16 PASS / 0 BLOCKED / 0 FAIL. No baseline was promoted, `productionEnabled` remains false, and no T03 work was started.

## Formal acceptance and archive preparation

- T02 Production Validation: **PASS**.
- User Acceptance: **Accepted**.
- Production Validated: **true**.
- The formal archive snapshot is prepared as `eian-paper-ui-broll-t02-production-validated-2026-09-06.zip`.
- `productionEnabled` remains `false`; T03 remains not started.
- No T01/T02 visual, animation, layout, punctuation, timing, or Production Validation logic was changed for formal archiving.
