#!/bin/zsh
# Double-click to install (first time) and start Courier Pages.
set -e
cd -- "$(dirname -- "$0")"
need_major=22; need_minor=13
node_ok() {
  command -v node >/dev/null && node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>$need_major||(a===$need_major&&b>=$need_minor)?0:1)"
}
# Finder does not load shell configuration, so look in the usual places for a recent Node.
if ! node_ok; then
  for dir in "$HOME"/.nvm/versions/node/v2[2-9]*/bin /opt/homebrew/opt/node@22/bin /opt/homebrew/bin /usr/local/bin; do
    if [[ -x "$dir/node" ]]; then
      PATH="$dir:$PATH"
      node_ok && break
    fi
  done
fi
if ! node_ok; then
  echo "Courier Pages needs Node.js $need_major.$need_minor or newer. Install it from https://nodejs.org, then open this again."
  read -r '?Press Return to close. '
  exit 1
fi
[[ -d node_modules ]] || npm ci
[[ -f dist/index.html ]] || npm run build
if [[ ! -f .connections-offered ]]; then
  echo ""
  echo "Courier Pages can connect to Claude Code, Claude Desktop and Codex so a chat can read and suggest changes to your screenplay."
  echo "Your screenplay only changes when you approve a suggestion in the editor."
  read -r '?Connect the AI apps found on this computer now? [Y/n] ' answer
  touch .connections-offered
  if [[ -z "$answer" || "$answer" == [Yy]* ]]; then npm run --silent connect -- --all; fi
fi
echo ""
echo "Courier Pages: http://127.0.0.1:${PORT:-4310}"
echo "Keep this window open. Press Control+C to stop."
echo ""
( sleep 3; open "http://127.0.0.1:${PORT:-4310}" ) >/dev/null 2>&1 &
exec npm start
