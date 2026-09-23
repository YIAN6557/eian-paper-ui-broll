# eian-paper-ui-broll — T02 Production Validation Preflight Patch

Base ZIP required:

`eian-paper-ui-broll-t02-9x16-preview-candidate-2026-09-05.zip`

Required base SHA-256:

`99c36180e9aa87fc0c14236ef51d6d3f613f5e58deb5890a5d31d53c3707e0f7`

This patch contains all source/script changes made after that uploaded base that are required for the currently approved T02 1:1 and 16:9 adaptations, punctuation line-break repair, and the T02 Production Validation preflight.

Important current state:

- T02 9:16 / 1:1 / 16:9 Preview Gates are approved.
- `productionEnabled` remains `false`.
- Formal T02 Production Validation has **not** passed yet.
- Current Chat-runtime manifest is 10 PASS / 1 BLOCKED / 0 FAIL because Remotion dependencies cannot be installed in this sandbox.
- Use the Mac run instructions in `T02_PRODUCTION_VALIDATION_MAC_RUN_2026-09-06.md` after applying this patch to an independent copy of the base ZIP.

Do not apply this patch directly to the immutable Stage 4 baseline ZIP or older archive snapshots.
