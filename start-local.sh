#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
if command -v node >/dev/null 2>&1; then
  exec node start-local.cjs "$@"
elif command -v python3 >/dev/null 2>&1; then
  exec python3 start-local.py "$@"
else
  printf '%s\n' 'Install Node.js or Python 3.8+ to run this local copy.'
  exit 1
fi
