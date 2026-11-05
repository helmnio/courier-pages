#!/bin/zsh
# Double-click to start Courier Pages. The first run also installs and builds it.
set -e
cd -- "$(dirname -- "$0")"
need_major=22; need_minor=13
node_ok() {
  command -v node >/dev/null && node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>$need_major||(a===$need_major&&b>=$need_minor)?0:1)"
}
echo ""
echo "  COURIER PAGES — your private screenplay writing room"
echo "  ----------------------------------------------------"
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
  echo "  Courier Pages needs Node.js $need_major.$need_minor or newer."
  echo "  Install it from https://nodejs.org, then double-click this file again."
  read -r '?  Press Return to close. '
  exit 1
fi
if [[ ! -d node_modules ]]; then echo "  First run: installing (a minute or two)..."; npm ci; fi
if [[ ! -f dist/index.html ]]; then echo "  First run: building the app..."; npm run build; fi
if [[ ! -f .connections-offered ]]; then
  echo ""
  echo "  Courier Pages can connect to Claude Code, Claude Desktop and Codex so a chat can"
  echo "  read and suggest changes to your screenplay. Your script only changes when you"
  echo "  approve a suggestion in the editor."
  read -r '?  Connect the AI apps found on this computer now? [Y/n] ' answer
  touch .connections-offered
  if [[ -z "$answer" || "$answer" == [Yy]* ]]; then
    npm run --silent connect -- --all
    echo ""
    echo "  Restart Claude / Codex so they pick up the connection."
  fi
fi
echo ""
echo "  Courier Pages is starting at: http://127.0.0.1:${PORT:-4310}"
echo "  Your browser will open in a moment."
echo ""
echo "  ► Keep this window open while you write. Press Control+C to stop."
echo ""
echo "  ► To use AI, open Claude or Codex and paste this to get going:"
echo ""
echo "    Use the Courier Pages tools to list my projects, then read the first scene of"
echo "    the one I name and suggest one improvement as a proposal I can review."
echo ""
( sleep 3; open "http://127.0.0.1:${PORT:-4310}" ) >/dev/null 2>&1 &
exec npm start
