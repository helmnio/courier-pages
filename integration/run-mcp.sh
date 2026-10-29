#!/bin/zsh
set -e
umask 077
cd -- "$(dirname -- "$0")/.."
for d in "$HOME"/.nvm/versions/node/v2[2-9]*/bin /opt/homebrew/opt/node@22/bin /opt/homebrew/bin /usr/local/bin; do
  if [[ -x "$d/node" ]]; then PATH="$d:$PATH"; break; fi
done
export PATH
mkdir -p integration/logs
exec node --import tsx server/mcp.ts 2>>integration/logs/mcp.log
