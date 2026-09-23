# eian-paper-ui-broll

[简体中文](README.zh-CN.md)

> A Codex Skill that turns a conversation between a user and an AI into Paper UI motion video using the packaged templates.

## Demo videos

These vertical examples are 1080 × 1920 and approximately 8 seconds long.

### T01 — Reference research console

https://github.com/user-attachments/assets/4cfc1656-0078-4984-bf53-7f178eeb02cd

### T02 — Paper dialogue

https://github.com/user-attachments/assets/e869905a-5ab4-46ac-80b9-b81f386991d1

### T03 — Keyflow

https://github.com/user-attachments/assets/2af88163-67d0-45bd-8e78-8c44f9fd2e20

## What it does

The Skill preserves the conversation’s meaning and message boundaries, then renders it with a template from the package’s enabled V1 registry. It does not rewrite or merge messages. The registry defines the available templates and supported aspect ratios.

## Workflow

```text
Conversation
  → Choose a template and supported aspect ratio
  → Choose resolution and background
  → Generate and review a Preview
  → Approve the Preview and confirm final settings
  → Render the video
  → Receive MP4 file(s) and manifest.json
```

Jobs up to and including 20 seconds produce one video. Longer jobs produce ordered Parts with a manifest; Parts are not automatically merged.

## Install

Install the complete package folder at:

- `$CODEX_HOME/skills/eian-paper-ui-broll`
- If `CODEX_HOME` is not set: `~/.codex/skills/eian-paper-ui-broll`

Keep the package structure intact, including the root `SKILL.md`. Start a new Codex task or reload the session after installation so Codex can discover the Skill.

## Quick start

In a new Codex task, ask Codex to use this Skill with the conversation you want to render. For example:

```text
Use eian-paper-ui-broll to turn the following conversation into a Paper UI video:
[paste the conversation]
```

Choose a template, a supported aspect ratio, resolution, and background when prompted. Review and explicitly approve the Preview, then confirm the final settings before formal rendering.

## First-run dependencies

Before creating a production job, the Skill checks the local runtime. If everything is ready, it continues without installing anything. If requirements are missing, it reports them and asks for your explicit consent before attempting installation.

Consent-based automatic installation is supported on macOS. On Linux and Windows, the gate reports missing requirements; install them with your platform’s normal method and run the check again. See [Runtime dependencies](docs/setup/runtime-dependencies.md) for the dependency list, gate behavior, and platform details.

## Scope

Use this Skill to make Paper UI motion videos from user–AI conversations with the templates and aspect ratios admitted by the package registry. See the [production contract](docs/architecture/skill-production-contract.md) for the complete interaction and delivery behavior.

## License


For commercial licensing, contact [ohhhhhmya@gmail.com](mailto:ohhhhhmya@gmail.com).

The package uses the custom [Eian Personal Non-Commercial License 1.0](LICENSE), with separate written commercial licensing. Individuals may install, run, and privately modify copies for non-commercial personal use. Commercial use—including monetized accounts, advertising, sponsorships, client or employer projects, and organizational or group use—requires prior written authorization and a separately agreed fee.

This is a source-available license, not an OSI-approved open-source license. Noto Sans SC remains separately licensed under the [SIL Open Font License](public/fonts/t02/OFL.txt); other third-party dependencies keep their own licenses. See [license status](LICENSE-STATUS.md).

## Project map

| File or directory | Responsibility |
| --- | --- |
| [SKILL.md](SKILL.md) | Skill entrypoint and concise top-level constraints. |
| [Production contract](docs/architecture/skill-production-contract.md) | User-visible workflow, approvals, rendering, retries, and delivery. |
| [Runtime dependencies](docs/setup/runtime-dependencies.md) | Required dependencies, first-use gate, consent flow, and platform behavior. |
| [Template registry](src/templates/registry.mjs) | Enabled templates and supported aspect ratios. |
| `scripts/cli/` and `scripts/lib/` | Skill job lifecycle and production commands. |
| `src/`, `assets/`, and `public/` | Composition source, bundled backgrounds, and font assets. |
| [Shared workflow specifications](specs/shared/WORKFLOW_STATE_MACHINE.md) and [timeline schema](specs/shared/TIMELINE_SCHEMA.md) | Workflow state and timeline data model. |
| [Project manifest](docs/project/canonical-project-manifest.md) and [project status](docs/project/project-status.md) | File authority map and current project state. |
| [AGENTS.md](AGENTS.md) and [CONTRIBUTING.md](CONTRIBUTING.md) | Package maintenance and contribution guidance. |
| [License](LICENSE) and [license status](LICENSE-STATUS.md) | License terms and current publication/licensing status. |

## FAQ

### Does the Skill change the conversation?

No. It preserves the meaning and message boundaries of the supplied conversation. Input parsing may apply only the light formatting cleanup supported by the existing parser.

### Can I skip the Preview?

No. Approve the generated Preview first, then confirm the final template, aspect ratio, resolution, background, output mode, and Part count before formal rendering.

### Will missing dependencies be installed automatically?

Only after the gate reports what is missing and you explicitly agree. If the gate is already ready, it does not install anything. Automatic dependency completion is supported on macOS; other platforms require manual installation.

### What files are delivered?

A job produces one MP4 or ordered Part MP4 files, plus `manifest.json`. Internal timelines, logs, Preview files, and frame sequences are not normal deliverables.

### Can I monetize a personal-account video?

Not under the free personal license. Monetized content is commercial use and requires prior written authorization and a separately agreed fee. See [LICENSE](LICENSE).

## Maintenance

Before changing the package, read [AGENTS.md](AGENTS.md) and [CONTRIBUTING.md](CONTRIBUTING.md), then update the file that owns the behavior in question. The README is an orientation page; detailed rules remain in their linked authority documents.
