# Workflow State and Lock Mechanics

## Authority

This document describes persisted workflow state and lock mechanics. User-visible choices, sequencing, and the Part 2 exception belong to the [Skill production contract](../../docs/architecture/skill-production-contract.md). The executable state transitions are implemented in [workflow-state.mjs](../../scripts/lib/workflow-state.mjs).

## Normal state path

`prepared → template-selected → visual-draft → background-resolved → preview-ready → approved → rendering → between-parts → completed`

The state path is persisted for lifecycle recovery; internal state names are not normal user-facing choices.

## Background state

- The default background is the T01 baseline `BG-P01` / legacy alias `b01-matte-paper`.
- An Image is normalized once, resolved to one persisted cover crop, and reused by each Part.
- Before Preview approval, a background change invalidates the resolved Background State and Preview.
- Preview approval locks dialogue content and the resolved Background State.
- A direct background mutation is rejected while that lock is held, including before formal rendering starts. The Skill lifecycle can first invalidate an approval for an accepted revision, then apply the requested change and require a new Preview.
- Formal rendering consumes the persisted Production Visual Lock / Render Manifest; it does not resolve a new background for each Part.

Every Part in one continuous job references the same `backgroundRenderStateId`. An identity mismatch or missing asset stops rendering rather than silently selecting another background. Failure preserves state, visual lock, manifest, logs, and required intermediates for diagnosis and retry.

## Template state

The template lock is set when the first formal MP4 render begins. When an exception allowed by the production contract is accepted, lifecycle state records the Part 2 override, creates a fresh Part 2 Preview state, and removes the continuity guarantee. It retains the approved background state.

Exact exception eligibility and user-facing explanation are defined only by the [Skill production contract](../../docs/architecture/skill-production-contract.md).
