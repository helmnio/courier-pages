#!/bin/zsh
set -e
set -o pipefail
umask 077
cd -- "$(dirname -- "$0")"
for d in "$HOME"/.nvm/versions/node/v2[2-9]*/bin /opt/homebrew/opt/node@22/bin /opt/homebrew/bin /usr/local/bin; do
  if [[ -x "$d/node" ]]; then PATH="$d:$PATH"; break; fi
done
export PATH
if ! node --import tsx --input-type=module -e 'const {backendToken,ensureBackend}=await import("./server/backend.ts");await ensureBackend(backendToken())'; then
  echo 'The local application could not be verified. No tunnel was started.'
  read -r '?Press Return to close. '
  exit 1
fi
if curl -fsS --max-time 3 http://127.0.0.1:4311/healthz >/dev/null 2>&1; then
  echo 'A connection is already running on port 4311. Open http://127.0.0.1:4311/ui to inspect it.'
  read -r '?Press Return to close. '
  exit 0
fi
mkdir -p integration/logs
if [[ -z "${CONTROL_PLANE_API_KEY:-}" ]]; then
  echo 'Courier Pages — private ChatGPT connection'
  echo 'Paste your OpenAI runtime API key below. It stays hidden and is not saved to disk.'
  read -rs 'CONTROL_PLANE_API_KEY?Runtime API key: '
  echo ''
  if [[ -z "$CONTROL_PLANE_API_KEY" ]]; then
    echo 'No key entered. Connection not started.'
    read -r '?Press Return to close. '
    exit 1
  fi
  export CONTROL_PLANE_API_KEY
fi
# Normalize terminal paste markers and optional surrounding quotes without echoing the key.
CONTROL_PLANE_API_KEY="$(node --import tsx integration/normalize-key.mjs)"
export CONTROL_PLANE_API_KEY
if ! integration/bin/tunnel-client doctor --profile screenplay-studio --profile-dir "$PWD/integration/profiles" --explain 2>&1 | tee -a integration/logs/tunnel.log; then
  echo 'Connection check did not pass. Review the message above; no plugin is connected yet.'
  read -r '?Press Return to close. '
  exit 1
fi
if ! node --import tsx integration/check-tunnel-auth.mjs; then
  echo 'The tunnel was not started because authentication could not be verified.'
  read -r '?Press Return to close. '
  exit 1
fi
echo ''
echo 'Keep this window open while ChatGPT uses Courier Pages.'
echo 'Connection status: http://127.0.0.1:4311/ui'
echo 'Press Control+C to stop the connection.'
integration/bin/tunnel-client run --profile screenplay-studio --profile-dir "$PWD/integration/profiles" 2>&1 | tee -a integration/logs/tunnel.log
