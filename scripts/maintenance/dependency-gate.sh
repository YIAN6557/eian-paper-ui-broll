#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
ACTION=check
CONSENT=
if [ "$#" -ge 1 ]; then ACTION=$1; fi
if [ "$#" -ge 2 ]; then CONSENT=$2; fi
REQUIRED_NODE=$(sed -n '1p' "$ROOT/.nvmrc" | tr -d '[:space:]')
OS_NAME=$(uname -s)
MISSING_NODE=0
MISSING_NPM=0
MISSING_FFMPEG=0
MISSING_FFPROBE=0
MISSING_NPM_DEPS=0
MISSING_REMOTION=0
MISSING_REMOTION_CLI=0
MISSING_REACT=0
MISSING_REACT_DOM=0
MISSING_LOCK_MARKER=0
MISSING_PACKAGE_LOCK=0
MISSING_BROWSER=0

node_major() {
  node --version 2>/dev/null | sed 's/^v//' | cut -d. -f1
}

lock_hash() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$ROOT/package-lock.json" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$ROOT/package-lock.json" | awk '{print $1}'
  else
    return 1
  fi
}

browser_ready() {
  for candidate in \
    "$ROOT"/node_modules/.remotion/chrome-headless-shell/*/chrome-headless-shell-*/chrome-headless-shell \
    "$ROOT"/node_modules/.remotion/chrome-headless-shell/*/chrome-headless-shell-*/chrome-headless-shell.exe; do
    if [ -x "$candidate" ]; then return 0; fi
  done
  for browser in chrome chromium chromium-browser google-chrome msedge; do
    if command -v "$browser" >/dev/null 2>&1; then return 0; fi
  done
  if [ "$OS_NAME" = "Darwin" ] && { [ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ] || [ -x "/Applications/Chromium.app/Contents/MacOS/Chromium" ]; }; then return 0; fi
  return 1
}

inspect() {
  if ! command -v node >/dev/null 2>&1 || [ "$(node_major || true)" != "$REQUIRED_NODE" ]; then MISSING_NODE=1; fi
  if ! command -v npm >/dev/null 2>&1; then MISSING_NPM=1; fi
  if ! command -v ffmpeg >/dev/null 2>&1; then MISSING_FFMPEG=1; fi
  if ! command -v ffprobe >/dev/null 2>&1; then MISSING_FFPROBE=1; fi

  if [ ! -f "$ROOT/package-lock.json" ]; then
    MISSING_PACKAGE_LOCK=1
  else
    if [ ! -f "$ROOT/node_modules/remotion/package.json" ]; then MISSING_REMOTION=1; fi
    if [ ! -f "$ROOT/node_modules/@remotion/cli/package.json" ]; then MISSING_REMOTION_CLI=1; fi
    if [ ! -f "$ROOT/node_modules/react/package.json" ]; then MISSING_REACT=1; fi
    if [ ! -f "$ROOT/node_modules/react-dom/package.json" ]; then MISSING_REACT_DOM=1; fi
    HASH=$(lock_hash || true)
    MARKER="$ROOT/node_modules/.eian-paper-ui-broll-runtime.json"
    if [ -z "$HASH" ] || [ ! -f "$MARKER" ] \
      || ! grep -Fq "$HASH" "$MARKER" \
      || ! grep -Fq '"nodeMajor": '"$REQUIRED_NODE" "$MARKER"; then
      MISSING_LOCK_MARKER=1
    fi
    if [ "$MISSING_REMOTION$MISSING_REMOTION_CLI$MISSING_REACT$MISSING_REACT_DOM$MISSING_LOCK_MARKER" != "00000" ]; then MISSING_NPM_DEPS=1; fi
  fi

  if ! browser_ready; then MISSING_BROWSER=1; fi
}

print_check() {
  inspect
  if [ "$MISSING_PACKAGE_LOCK" -eq 1 ]; then
    echo "BLOCKED=package-lock.json is missing; the Skill package itself needs repair."
    echo "GATE_STATUS=BLOCKED"
    return 3
  fi
  if [ "$MISSING_NODE" -eq 1 ]; then
    FOUND_NODE=$(node --version 2>/dev/null || echo "not installed")
    echo "MISSING=Node.js $REQUIRED_NODE.x (found $FOUND_NODE)"
  fi
  if [ "$MISSING_NPM" -eq 1 ]; then echo "MISSING=npm"; fi
  if [ "$MISSING_FFMPEG" -eq 1 ]; then echo "MISSING=FFmpeg executable: ffmpeg"; fi
  if [ "$MISSING_FFPROBE" -eq 1 ]; then echo "MISSING=FFprobe executable: ffprobe"; fi
  if [ "$MISSING_REMOTION" -eq 1 ]; then echo "MISSING=npm package: remotion"; fi
  if [ "$MISSING_REMOTION_CLI" -eq 1 ]; then echo "MISSING=npm package: @remotion/cli"; fi
  if [ "$MISSING_REACT" -eq 1 ]; then echo "MISSING=npm package: react"; fi
  if [ "$MISSING_REACT_DOM" -eq 1 ]; then echo "MISSING=npm package: react-dom"; fi
  if [ "$MISSING_LOCK_MARKER" -eq 1 ]; then echo "MISSING=verified package-lock.json runtime marker for Node.js $REQUIRED_NODE"; fi
  if [ "$MISSING_BROWSER" -eq 1 ]; then echo "MISSING=Remotion-compatible Chrome/Chromium browser"; fi

  if [ "$MISSING_NODE$MISSING_NPM$MISSING_FFMPEG$MISSING_FFPROBE$MISSING_NPM_DEPS$MISSING_BROWSER" = "000000" ]; then
    echo "GATE_STATUS=READY"
    echo "No installs performed."
    return 0
  fi
  echo "GATE_STATUS=CONSENT_REQUIRED"
  if [ "$OS_NAME" = "Darwin" ] && { [ "$MISSING_NODE" -eq 1 ] || [ "$MISSING_NPM" -eq 1 ] || [ "$MISSING_FFMPEG" -eq 1 ] || [ "$MISSING_FFPROBE" -eq 1 ]; }; then
    if command -v brew >/dev/null 2>&1; then
      echo "INSTALLER=Homebrew (already available)"
    else
      echo "INSTALLER=Homebrew will be installed first; macOS may request administrator authentication."
    fi
  fi
  echo "INSTALL_NETWORK=Required only for missing packages or the Remotion browser download."
  return 2
}

find_brew() {
  if command -v brew >/dev/null 2>&1; then command -v brew; return 0; fi
  for candidate in /opt/homebrew/bin/brew /usr/local/bin/brew; do
    if [ -x "$candidate" ]; then echo "$candidate"; return 0; fi
  done
  return 1
}

install_brew() {
  BREW=$(find_brew || true)
  if [ -n "$BREW" ]; then return 0; fi
  if [ "$OS_NAME" != "Darwin" ]; then
    echo "GATE_STATUS=BLOCKED"
    echo "Automatic system dependency installation is currently supported on macOS only."
    return 1
  fi
  if ! command -v curl >/dev/null 2>&1; then
    echo "GATE_STATUS=BLOCKED"
    echo "curl is required to install Homebrew from its official installer."
    return 1
  fi
  echo "Installing the Homebrew package manager from its official installer."
  NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  BREW=$(find_brew || true)
  if [ -z "$BREW" ]; then
    echo "GATE_STATUS=BLOCKED"
    echo "Homebrew installation did not produce a usable brew command."
    return 1
  fi
}

install_missing() {
  if [ "$OS_NAME" != "Darwin" ]; then
    echo "GATE_STATUS=BLOCKED"
    echo "Automatic dependency installation is currently supported on macOS only."
    return 1
  fi
  if [ "$MISSING_NODE" -eq 1 ] || [ "$MISSING_NPM" -eq 1 ] || [ "$MISSING_FFMPEG" -eq 1 ] || [ "$MISSING_FFPROBE" -eq 1 ]; then
    install_brew
    if [ "$MISSING_NODE" -eq 1 ]; then "$BREW" install node@22; fi
    if [ "$MISSING_FFMPEG" -eq 1 ] || [ "$MISSING_FFPROBE" -eq 1 ]; then "$BREW" install ffmpeg; fi
    eval "$("$BREW" shellenv)"
    NODE_PREFIX=$("$BREW" --prefix node@22 2>/dev/null || true)
    if [ -n "$NODE_PREFIX" ] && [ -x "$NODE_PREFIX/bin/node" ]; then PATH="$NODE_PREFIX/bin:$PATH"; export PATH; fi
  fi
  if [ "$MISSING_NODE" -eq 1 ] || [ "$MISSING_NPM" -eq 1 ]; then
    if ! command -v node >/dev/null 2>&1 || [ "$(node_major || true)" != "$REQUIRED_NODE" ] || ! command -v npm >/dev/null 2>&1; then
      echo "GATE_STATUS=BLOCKED"
      echo "Node.js $REQUIRED_NODE and npm were not resolved after system installation."
      return 1
    fi
  fi
  if [ "$MISSING_NPM_DEPS" -eq 1 ]; then
    node "$ROOT/scripts/maintenance/bootstrap-runtime.mjs" --consent
    MISSING_BROWSER=1
  fi
  if [ "$MISSING_BROWSER" -eq 1 ]; then
    "$ROOT/node_modules/.bin/remotion" browser ensure
  fi
  node "$ROOT/scripts/maintenance/doctor.mjs"
  echo "GATE_STATUS=READY"
  echo "All required dependencies are installed and verified."
}

case "$ACTION" in
  check)
    print_check
    ;;
  install)
    if [ "$CONSENT" != "--consent" ]; then
      echo "GATE_STATUS=CONSENT_REQUIRED"
      echo "Installation is disabled until the Skill has explicit user approval."
      exit 2
    fi
    if print_check; then exit 0; else CHECK_STATUS=$?; fi
    if [ "$CHECK_STATUS" -ne 2 ]; then exit "$CHECK_STATUS"; fi
    install_missing
    ;;
  *)
    echo "Usage: sh scripts/maintenance/dependency-gate.sh check | install --consent" >&2
    exit 64
    ;;
esac
