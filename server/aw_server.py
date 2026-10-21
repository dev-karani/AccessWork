"""AccessWork local speech server.

POST /api/transcribe  body: audio (wav/webm/ogg)  -> {"text": "..."}   (local Whisper)
POST /api/tts         body: {"text": "..."}       -> audio/wav          (Piper if installed, else espeak-ng)
GET  /api/health                                  -> engine status

Runs entirely on this machine, so speech never goes to Google or any cloud service.
Environment: AW_WHISPER_MODEL (default "base"), AW_PORT (default 8765).
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
PORT = int(os.environ.get("AW_PORT", "8765"))
HOST = os.environ.get("AW_HOST", "127.0.0.1")
MODEL_NAME = os.environ.get("AW_WHISPER_MODEL", "base")
PIPER_VOICE = HERE / "voices" / "en_GB-jenny_dioco-medium.onnx"


def piper_python() -> Path:
    """Prefer an explicit interpreter, then the local venv, then this process (Docker)."""
    env = os.environ.get("AW_PIPER_PYTHON")
    if env:
        return Path(env)
    local = HERE / ".piper-venv" / "bin" / "python"
    if local.exists():
        return local
    return Path(sys.executable)

# Biases Whisper towards the words this desk actually hears.
PROMPT = "Hotel front desk in Kenya. Reservation, check-in, check-out, room key, breakfast, M-Pesa, Wi-Fi, shillings."

# Phrases Whisper tends to invent from silence or background noise.
HALLUCINATIONS = {"you", "thank you.", "thanks for watching!", "thank you for watching.", "bye.", "."}

state = {"model": None, "device": None, "error": None}
model_lock = threading.Lock()
piper_lock = threading.Lock()
piper_proc: subprocess.Popen | None = None


def piper_worker() -> subprocess.Popen:
    """Start (or reuse) a Piper process that keeps the voice loaded between requests."""
    global piper_proc
    if piper_proc is None or piper_proc.poll() is not None:
        piper_proc = subprocess.Popen(
            [str(piper_python()), str(HERE / "piper_worker.py"), str(PIPER_VOICE)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        if piper_proc.stdout.readline().strip() != "ready":
            raise RuntimeError("Piper failed to start")
    return piper_proc


def load_model():
    try:
        import torch
        import whisper

        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"[whisper] loading '{MODEL_NAME}' on {device}…", flush=True)
        model = whisper.load_model(MODEL_NAME, device=device)
        # The first decode is slow (CUDA kernels compile); do it now instead of on the guest's first sentence.
        import numpy as np

        model.transcribe(np.zeros(16000, dtype=np.float32), language="en", fp16=device == "cuda")
        state["device"] = device
        state["model"] = model
        print("[whisper] ready", flush=True)
    except Exception as exc:  # noqa: BLE001 - report any load failure to the UI
        state["error"] = str(exc)
        print(f"[whisper] failed to load: {exc}", file=sys.stderr, flush=True)


def tts_engine():
    if piper_python().exists() and PIPER_VOICE.exists():
        return "piper"
    if shutil.which("espeak-ng"):
        return "espeak-ng"
    return None


def wav_to_array(audio: bytes):
    """Read 16 kHz mono 16-bit WAV straight into the array Whisper expects, skipping ffmpeg."""
    import io
    import wave

    import numpy as np

    with wave.open(io.BytesIO(audio)) as wf:
        if wf.getframerate() != 16000 or wf.getnchannels() != 1 or wf.getsampwidth() != 2:
            return None
        pcm = wf.readframes(wf.getnframes())
    return np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0


def transcribe(audio: bytes, content_type: str) -> str:
    source = wav_to_array(audio) if "wav" in content_type else None
    path = None
    if source is None:
        suffix = ".wav" if "wav" in content_type else ".ogg" if "ogg" in content_type else ".webm"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
            f.write(audio)
            path = f.name
        source = path
    try:
        with model_lock:
            result = state["model"].transcribe(
                source,
                language="en",
                fp16=state["device"] == "cuda",
                temperature=0.0,
                condition_on_previous_text=False,
                initial_prompt=PROMPT,
            )
    finally:
        if path:
            os.unlink(path)

    kept = [
        s["text"].strip()
        for s in result.get("segments", [])
        if s.get("no_speech_prob", 0) < 0.6 and s.get("avg_logprob", 0) > -1.0
    ]
    text = " ".join(kept).strip()
    return "" if text.lower() in HALLUCINATIONS else text


def synthesize(text: str) -> bytes:
    engine = tts_engine()
    if engine is None:
        raise RuntimeError("No text-to-speech engine found. Install espeak-ng or Piper.")
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        out = f.name
    try:
        if engine == "piper":
            with piper_lock:
                proc = piper_worker()
                proc.stdin.write(json.dumps({"text": text, "out": out}) + "\n")
                proc.stdin.flush()
                reply = proc.stdout.readline().strip()
            if reply != "ok":
                raise RuntimeError(f"Piper: {reply or 'no response'}")
        else:
            cmd = ["espeak-ng", "-v", "en-gb", "-s", "150", "-w", out, text]
            subprocess.run(cmd, check=True, capture_output=True, timeout=60)
        return Path(out).read_bytes()
    finally:
        os.unlink(out)


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, body: bytes, content_type: str = "application/json"):
        try:
            self.send_response(code)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass  # the client went away; nothing to report

    def _json(self, code: int, data: dict):
        self._send(code, json.dumps(data).encode())

    def _body(self) -> bytes:
        return self.rfile.read(int(self.headers.get("Content-Length", 0)))

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path == "/api/health":
            whisper_status = "ready" if state["model"] else ("error" if state["error"] else "loading")
            self._json(200, {
                "whisper": whisper_status,
                "model": MODEL_NAME,
                "device": state["device"],
                "error": state["error"],
                "tts": tts_engine(),
            })
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self):
        try:
            if self.path == "/api/transcribe":
                if not state["model"]:
                    self._json(503, {"error": state["error"] or "Whisper is still loading"})
                    return
                text = transcribe(self._body(), self.headers.get("Content-Type", ""))
                self._json(200, {"text": text})
            elif self.path == "/api/tts":
                text = json.loads(self._body() or b"{}").get("text", "").strip()
                if not text:
                    self._json(400, {"error": "text is required"})
                    return
                self._send(200, synthesize(text), "audio/wav")
            else:
                self._json(404, {"error": "not found"})
        except Exception as exc:  # noqa: BLE001 - surface errors to the browser
            print(f"[error] {self.path}: {exc}", file=sys.stderr, flush=True)
            self._json(500, {"error": str(exc)})

    def log_message(self, fmt, *args):
        line = str(args[0]) if args else ""
        if "/api/" in line and "/api/health" not in line:
            sys.stderr.write("[http] " + fmt % args + "\n")


def warm_piper():
    if tts_engine() == "piper":
        try:
            with piper_lock:
                piper_worker()
            print("[piper] voice loaded", flush=True)
        except Exception as exc:  # noqa: BLE001 - espeak-ng remains available
            print(f"[piper] failed: {exc}", file=sys.stderr, flush=True)


if __name__ == "__main__":
    threading.Thread(target=load_model, daemon=True).start()
    threading.Thread(target=warm_piper, daemon=True).start()
    print(f"[server] AccessWork speech server on http://{HOST}:{PORT} (tts: {tts_engine()})", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
