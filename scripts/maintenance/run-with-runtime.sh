#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
REQUIRED_NODE=$(sed -n '1p' "$ROOT/.nvmrc" | tr -d '[:space:]')
NODE_BIN=$(command -v node || true)

if command -v brew >/dev/null 2>&1; then
  NODE_PREFIX=$(brew --prefix "node@$REQUIRED_NODE" 2>/dev/null || true)
  if [ -n "$NODE_PREFIX" ] && [ -x "$NODE_PREFIX/bin/node" ]; then
    NODE_BIN="$NODE_PREFIX/bin/node"
    PATH="$NODE_PREFIX/bin:$PATH"
    export PATH
  fi
fi

if [ -z "$NODE_BIN" ]; then
  echo "Node.js $REQUIRED_NODE is missing. Run the Skill dependency gate first." >&2
  exit 1
fi

ACTUAL_NODE=$("$NODE_BIN" --version | sed 's/^v//' | cut -d. -f1)
if [ "$ACTUAL_NODE" != "$REQUIRED_NODE" ]; then
  echo "Node.js $REQUIRED_NODE is required; found $ACTUAL_NODE. Run the Skill dependency gate first." >&2
  exit 1
fi

exec "$NODE_BIN" "$@"
