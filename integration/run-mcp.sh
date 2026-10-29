#!/bin/zsh
set -e
umask 077
cd -- "$(dirname -- "$0")/.."
export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"
mkdir -p integration/logs
exec node --import tsx server/mcp.ts 2>>integration/logs/mcp.log
