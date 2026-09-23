# Contributing

## Before proposing a change

- Read [AGENTS.md](AGENTS.md) and the [file authority map](docs/project/canonical-project-manifest.md#文件职权).
- Change the existing owner file for the affected behavior; update references when a path changes.
- Keep T01 / T02 / T03 locked visual behavior intact unless the authorized change explicitly targets it.
- Consult [runtime dependencies](docs/setup/runtime-dependencies.md) before running production tooling.

## Package checks

From the package root:

```sh
node scripts/maintenance/build-package-manifest.mjs
node scripts/maintenance/validate-package.mjs
```

The CI workflow owns the automated unit and lifecycle command list: [.github/workflows/ci.yml](.github/workflows/ci.yml). Run applicable checks for code changes when authorized; documentation-only changes need package structure and link checks.

Follow [LICENSE-STATUS.md](LICENSE-STATUS.md) for the current publication and licensing decision.
