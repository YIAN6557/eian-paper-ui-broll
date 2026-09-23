# Stage 3 Background System — Formal Source Integration Validation

Date: 2026-09-04

## Result

- PASS: 17
- BLOCKED: 1
- FAIL: 0

Machine-readable result:
`validation/stage3-background-integration-manifest.json`

## Important passes

- Stage 2 parser regression: PASS
- Stage 2 segmentation regression: PASS
- Stage 2 workflow / Template Lock regression: PASS
- Locked/default T01 reference Preview after Stage 3 integration: pixel-exact PASS
- Solid Preview + H.264 MP4: PASS
- Paper Warm Preview + H.264 MP4: PASS
- Image Center Preview + H.264 MP4: PASS
- Background Lock after Preview approval: PASS
- Background change rejection leaves Job State unchanged: PASS
- Multi-Part same BackgroundRenderStateId: PASS
- Raw pre-encode background seam: exact 0-difference PASS
- Missing Background asset hard failure: PASS
- Failure log/state preservation: PASS
- Exact asset restoration + resume: PASS
- Exactly-two-Part Template exception keeps Background State unchanged: PASS
- Stage 3 TSX adapter static TypeScript check: PASS

## Locked T01 regression evidence

Archived Stage 2 Preview SHA-256:
`2b6989b1b697609104547f84dd446cd6a2d62b7b3caf69e10cc6e2c7fbd36a04`

Post-Stage-3-integration default Preview SHA-256:
`2b6989b1b697609104547f84dd446cd6a2d62b7b3caf69e10cc6e2c7fbd36a04`

The two PNGs are pixel-identical in the reference validation path.

## Cross-platform environment simplification

Validated after Stage 3 integration:
- `doctor.mjs` no longer treats macOS as a requirement; platform is informational only.
- `npm run setup` is the single dependency-install + doctor entry.
- temporary cleanup uses Node instead of Bash.
- no separate macOS/Windows Skill or platform adapter layer was added.
- Parser, Segmentation, Workflow, and Stage 3 Background regression tests remain PASS.

## Blocked gate

`REMOTION-RUNTIME-INTEGRATION` is BLOCKED, not failed.

Reason:
- formal archive contains package metadata but no installed `node_modules`;
- npm registry access from the current Chat container fails with `EAI_AGAIN`;
- therefore Remotion cannot be installed/executed in this environment.

The project must still run Remotion Preview/MP4 in a production environment with dependencies available before Stage 3 is called fully production-validated.

## Production gate command

A single cross-platform `npm run validate:production` command now owns the remaining Remotion gate. The current Chat container records this as `BLOCKED` because Remotion dependencies cannot be installed here. This is an environment block, not a Stage 3 logic/reference-engine failure.

The T01 source line contains only a minimal transparency hook for non-default Backgrounds. Default BG-P01 keeps the original T01 canvas active and remains pixel-exact with the archived Stage 2 reference Preview.
