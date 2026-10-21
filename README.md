# AccessWork

Front-desk communication for a Deaf receptionist and a hearing guest. Speech, signing, and voice notes run on the same machine — nothing is sent to a cloud speech API.

- **Guest → employee:** the guest speaks. Local Whisper turns it into text, and **Zuri** (3D avatar, or 2D cartoon) signs the message.
- **Employee → guest:** the employee signs to the camera, taps a phrase, or types. The guest sees the text and gets a voice note.
- **Alerts:** the employee screen flashes when the guest starts talking.

The microphone and cameras only work on `localhost` or HTTPS.

## Run with Docker (recommended to share)

You need [Docker](https://docs.docker.com/get-docker/) and Docker Compose, or [Podman](https://podman.io/). The image installs Node, Python, Whisper (`base`), Piper, ffmpeg, and espeak-ng.

```bash
docker compose up --build
```

On Fedora without the Docker daemon, use Podman:

```bash
podman build -t accesswork:latest .
podman run --rm -p 8080:80 -v whisper-cache:/root/.cache/whisper -v piper-voices:/app/server/voices accesswork:latest
```

Open **http://localhost:8080**. The first start downloads a Piper voice (~60 MB) into a volume. Whisper is already in the image. Health: `curl http://localhost:8080/api/health`.

Stop with `Ctrl+C`, or `docker compose down` / `podman stop` on the running container.

A bigger Whisper model (better with Kenyan names, ~460 MB download on first run):

```bash
AW_WHISPER_MODEL=small docker compose up --build
```

This image uses **CPU** PyTorch so it runs on any laptop. For GPU Whisper on your own machine, use the local setup below.

## Run locally (GPU Whisper if you have CUDA)

```bash
npm install
pip install -r requirements.txt
# optional voice notes
python3 -m venv server/.piper-venv
server/.piper-venv/bin/pip install piper-tts
mkdir -p server/voices && cd server/voices
curl -LO https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/jenny_dioco/medium/en_GB-jenny_dioco-medium.onnx
curl -LO https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/jenny_dioco/medium/en_GB-jenny_dioco-medium.onnx.json
cd ../..
npm start
```

App: http://localhost:5173 · speech server: http://127.0.0.1:8765

If Piper is missing, the server uses `espeak-ng`. If neither is installed, the browser’s built-in voice is used.

## Signing to the camera

Hand tracking uses MediaPipe (files in `public/mediapipe`).

1. Open **Teach my signs** and record each phrase 2–3 times.
2. Sign a phrase. The app finds the closest recorded sample.
3. Press **Send to guest**. Nothing is sent without confirmation.

This is template matching, not a general Kenyan Sign Language translator. Recorded signs stay in the browser (localStorage).

## Avatar

- `src/avatar/signs.ts` — English → glosses (placeholders until Deaf KSL signers check them)
- `src/avatar/Avatar3D.tsx` — Mixamo “Michelle” (`public/models/michelle.glb`)
- `src/avatar/Avatar.tsx` — 2D SVG

The 3D model has no face rig, so mouth and expressions do not move.
