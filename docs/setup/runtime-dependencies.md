# Runtime Dependencies

This is the sole authority for the production runtime dependency list, first-use gate behavior, installation scope, and supported platforms. The executable check is `scripts/maintenance/dependency-gate.sh`.

## Required for the normal Skill workflow

| Dependency | Required version or source | Purpose |
| --- | --- | --- |
| Node.js | 22.x, declared in `.nvmrc` | Runs the Skill lifecycle and Remotion CLI. |
| npm | Bundled with Node.js | Installs the lockfile-pinned JavaScript packages. |
| `remotion` | Exact `package-lock.json` version | Composition runtime. |
| `@remotion/cli` | Exact lockfile version | Bundles Preview and renders MP4. |
| `react` and `react-dom` | Exact lockfile versions | React composition runtime. |
| Chrome or Chromium | Compatible local browser or Remotion Headless Shell | Remotion frame rendering. |
| `ffmpeg` and `ffprobe` | Executables on `PATH` | Media processing and output verification. |

`package.json` declares the direct JavaScript dependencies; `package-lock.json` pins the full dependency tree. Backgrounds and fonts are bundled in the package. Noto Sans SC retains its accompanying [OFL notice](../../public/fonts/t02/OFL.txt).

## First-use behavior

The Skill runs `sh scripts/maintenance/dependency-gate.sh check` before creating a production job.

1. `GATE_STATUS=READY` means required dependencies are available; continue without installing.
2. `GATE_STATUS=CONSENT_REQUIRED` includes every `MISSING=` item and an installation summary. Show both to the user and wait for explicit approval.
3. Only after approval may the Skill run `sh scripts/maintenance/dependency-gate.sh install --consent`.
4. The gate verifies the result. If the user declines, setup fails, or any dependency remains missing, report the missing items and stop before job creation.

The check action is read-only. If the gate reports a package-level problem such as a missing lockfile, treat it as a package repair condition rather than ordinary user setup.

## Platform behavior

Consent-based automatic completion of system dependencies is implemented for macOS. It may install Homebrew, Node.js 22, and FFmpeg when absent; it uses the package lock for JavaScript dependencies and ensures a Remotion browser. Downloads require network access, and Homebrew may request macOS administrator authentication.

On Linux and Windows, the gate reports missing requirements but does not automatically install them. Install missing dependencies using the platform's normal method, then rerun `npm run gate:check`.

Preview and Formal Render lifecycle checks are read-only. The optional reference renderer at `dev/reference_renderer.py` is not part of the normal workflow and needs Python 3, Pillow, and system Noto fonts.

## Official references

- [Node.js 22 downloads](https://nodejs.org/en/download/archive/v22)
- [Remotion browser ensure](https://www.remotion.dev/docs/cli/browser/ensure)
- [Remotion Chrome Headless Shell](https://www.remotion.dev/docs/miscellaneous/chrome-headless-shell)
- [Remotion renderer](https://www.remotion.dev/docs/renderer)
- [Homebrew FFmpeg formula](https://formulae.brew.sh/formula/ffmpeg)
