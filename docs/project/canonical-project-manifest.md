# Package and Project Manifest

## Official Skill source

This modular package is the sole official installable `eian-paper-ui-broll` Skill source. Its root is `.`. The Desktop Canonical Source remains outside this package and is not a second installable Skill distribution.

## File authority

### 文件职权

| File | Sole responsibility |
| --- | --- |
| [SKILL.md](../../SKILL.md) | Concise Skill entrypoint, routing, and top-level constraints. |
| [Skill production contract](../architecture/skill-production-contract.md) | Complete user-visible production workflow and delivery behavior. |
| [Template registry](../../src/templates/registry.mjs) | Executable template admission and supported ratios. |
| [Runtime dependencies](../setup/runtime-dependencies.md) | Required tools, first-use checks, consent-based install behavior, and platform support. |
| [Workflow state](../../specs/shared/WORKFLOW_STATE_MACHINE.md) | Persisted workflow states and lock mechanics. |
| [Timeline schema](../../specs/shared/TIMELINE_SCHEMA.md) | Explanation of the timeline data model; the JSON schema file owns serialized shape. |
| [Timeline JSON schema](../../src/timeline/timeline.schema.json) | Machine-readable timeline structure. |
| [Project status](project-status.md) | Current milestone and active project state. |
| [License status](../../LICENSE-STATUS.md) | Public licensing decision and publication status. |
| `PACKAGE_MANIFEST.json` | Generated package file inventory, hashes, and package identifiers. |
| This file | Package identity and historical source-baseline lineage. |
| [Archive manifest](archive-manifest.md) | Historical archive and validation-evidence index. |
| `specs/production/` | Dated production-validation records; not current template admission or project status. |

Do not copy these responsibilities into another file; link to the owner.

## Baseline lineage

The package baseline record captured on 2026-09-11 refers to:

- baseline/eian-paper-ui-broll-t01-t02-t03-canonical-production-validated-skill-construction-validated-2026-09-11.zip
- Baseline artifact SHA-256: `f4482e4932e97b6e7e2a2af83f3fbf1846b109c0886cb1db1dc6c0ad032c8abc`
- Entry count: 171
- Archive size: 8475452 bytes
- ZIP integrity: PASS
- Clean recovery validation: PASS
- Source build fingerprint captured by that baseline: `sha256:557e581c3c1c8db6a129fe24f701d8c49b831f1689caa6ae02f8c7e1f8d250db`

These values describe that historical baseline. They are not hashes, status, or integrity claims for the current modular Skill package.

The earlier recovery baseline is `baseline/eian-paper-ui-broll-t01-t02-t03-canonical-production-validated-2026-09-07.zip`.
