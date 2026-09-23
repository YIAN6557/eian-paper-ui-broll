# eian-paper-ui-broll — Skill Production Contract

## Authority

This file owns complete user-visible production behavior. [SKILL.md](../../SKILL.md) is the concise entrypoint and routes here; it does not repeat this contract.

Runtime template admission is defined by [the registry](../../src/templates/registry.mjs). Dependency names and setup behavior belong to [runtime dependencies](../setup/runtime-dependencies.md). Persisted workflow mechanics and the timeline model are described in [workflow state](../../specs/shared/WORKFLOW_STATE_MACHINE.md) and [timeline schema](../../specs/shared/TIMELINE_SCHEMA.md).

This contract describes production behavior represented by the package lifecycle. It does not authorize changes to locked visual templates.

## Input and selection

- Accept a dialogue with user and assistant turns, either role-labeled text or structured JSON supported by the existing parser.
- Preserve meaning and message boundaries. Apply only parser-supported light formatting cleanup.
- The user must explicitly select the template.
- A template recommendation is allowed, but automatic selection is not.
- The user must explicitly select a ratio supported by the selected template. The registry owns the current ratio matrix.
- T03 不支持 1:1. Explain its supported choices without silently substituting another template or ratio.
- Final resolution is `720p` or `1080p`; `1080p`：默认.
- The user may select a background. If none is selected, use the existing Background System default. Do not invent background options.

Keep ordinary interaction staged and concise: accept dialogue, confirm template and supported ratio, then resolution and background.

## Duration and delivery Parts

Use the compiled timeline's actual duration.

- 20 秒或以下：deliver one complete user-visible video.
- 超过 20 秒：deliver multiple user-visible Parts.
- 每个 Part 均不超过 20 秒. Prefer dialogue and semantic boundaries and avoid cutting through a sentence where possible.
- Internal timeline segmentation is an implementation detail; do not present it as user-visible delivery.

A single-output job delivers `final.mp4` and `manifest.json`. A multi-Part job delivers ordered files such as `part-01.mp4` and `part-02.mp4`, plus `manifest.json`. Do not automatically merge multi-Part output.

## Preview and final confirmation

Preview 是强制步骤 before Formal Render.

- Generate one 720p static Preview representing the whole job, including a multi-Part job.
- Wait for explicit approval. If rejected, do not render; apply only requested revisions and generate a new Preview.
- The Preview confirms the dialogue, template, ratio, background, and overall composition.
- A change accepted by the lifecycle that affects the approved Preview requires a new Preview. Respect the persisted background and template locks in [workflow state](../../specs/shared/WORKFLOW_STATE_MACHINE.md); do not bypass a rejected mutation.
- A final-resolution-only change may retain Preview approval, but final parameters must be confirmed again.

After Preview approval, restate and confirm the final template, ratio, resolution, background, output mode, and Part count before Formal Render.

## Template Lock and its Part 2 exception

The template locks when the first user-visible Part begins Formal Render. A template change after that point is unavailable except for the exact exception below.

The exception applies only when the job has exactly two user-visible Parts, Part 1 is complete, and Part 2 has not started Formal Render. The user may then choose a different template for Part 2.

For that exception:

- Generate a new Part 2 Preview and obtain explicit approval before rendering it.
- Preserve ratio, final resolution, and background.
- Set `continuityGuarantee: false` and explain that the Parts are no longer guaranteed to join seamlessly.
- Do not extend the exception to any other Part count or position.

## Formal Render, failure, and retry

Render user-visible Parts serially through the existing lifecycle.

- Do not pause after each successful Part for routine approval.
- Retain successful Parts when a later Part fails.
- Retry from the failed Part, then continue with remaining unrendered Parts; do not rerender successful Parts.
- Give the user a concise error summary. Keep renderer logs for engineering diagnosis.
- If the user changes dialogue or visual parameters after failure, return to Preview. If the approved state is unchanged, use the existing retry path.

## Delivery and manifest

Deliver only the completed video file or ordered Part files and `manifest.json`. Do not present Preview images, logs, workflow state, timeline files, or internal segments as normal deliverables.

The manifest records production details such as template, ratio, resolution, background, Part order and duration, Preview/render state, continuity, retry, and completion status. It must not contain a complete copy of the source dialogue.
