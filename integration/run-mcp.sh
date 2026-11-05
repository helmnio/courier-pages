#!/usr/bin/env bash
set -e
umask 077
cd -- "$(dirname -- "$0")/.."
# Keep the Node already on PATH if it is new enough (it has node:sqlite); otherwise look for one.
if ! node -e "require('node:sqlite')" >/dev/null 2>&1; then
  for d in "$HOME"/.nvm/versions/node/v2[2-9]*/bin /opt/homebrew/opt/node@22/bin /opt/homebrew/bin /usr/local/bin; do
    if [[ -x "$d/node" ]]; then PATH="$d:$PATH"; break; fi
  done
fi
export PATH
mkdir -p integration/logs
exec node --import tsx server/mcp.ts 2>>integration/logs/mcp.log
