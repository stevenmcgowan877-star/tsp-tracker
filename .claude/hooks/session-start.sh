#!/bin/bash
# Installs npm dependencies so `npm test`, `npm run lint` and `npm run build`
# work at the start of a Claude Code on the web session. Runs only in the
# remote environment; local machines manage their own node_modules.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

# npm install (not npm ci) reuses node_modules from the cached container
# state, so repeat sessions are fast; it is a no-op when nothing changed.
# Chromium is pre-installed in the environment, so skip any browser download.
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --no-audit --no-fund
