"""Keeps one Piper voice loaded and turns text into WAV files on request.

Runs inside server/.piper-venv. Reads one JSON object per line on stdin: {"text": ..., "out": path}
and answers each with a line "ok" or "error: <message>".
"""

import json
import sys
import wave

from piper import PiperVoice

voice = PiperVoice.load(sys.argv[1])
print("ready", flush=True)

for line in sys.stdin:
    try:
        job = json.loads(line)
        with wave.open(job["out"], "wb") as wf:
            voice.synthesize_wav(job["text"], wf)
        print("ok", flush=True)
    except Exception as exc:  # noqa: BLE001 - report back to the server
        print(f"error: {exc}", flush=True)
