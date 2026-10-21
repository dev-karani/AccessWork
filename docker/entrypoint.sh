#!/bin/sh
set -eu

mkdir -p /app/server/voices
VOICE=/app/server/voices/en_GB-jenny_dioco-medium.onnx
VOICE_JSON=/app/server/voices/en_GB-jenny_dioco-medium.onnx.json
BASE=https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/jenny_dioco/medium

if [ ! -f "$VOICE" ]; then
  echo "[entrypoint] downloading Piper voice…"
  curl -fsSL -o "$VOICE" "$BASE/en_GB-jenny_dioco-medium.onnx"
  curl -fsSL -o "$VOICE_JSON" "$BASE/en_GB-jenny_dioco-medium.onnx.json"
fi

python3 /app/server/aw_server.py &
exec nginx -g "daemon off;"
