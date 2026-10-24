# ACCESS UI audit

Date: 24 October 2026  
Baseline: `npm run lint` (pass), `npm run build` (pass). No unit or e2e tests existed.

## Stack

| Area | What exists |
|---|---|
| App | Vite 8 + React 19 + TypeScript. Single `App` tree, no router, no auth, no design system. |
| Speech | `src/speech.ts` → `/api/transcribe`, `/api/tts`, `/api/health` (local Python `server/aw_server.py`, Whisper + Piper/espeak). |
| Avatar | `useSigner` + Mixamo GLB / 2D SVG. English word list → placeholder poses. **Not verified KSL.** |
| Phrases | `src/phrases.ts` hospitality templates. |
| Camera | MediaPipe hand landmarks + DTW templates in `localStorage`. Confirm-before-send. **Not live KSL.** |
| Session | In-memory `messages[]`. Clear button, no confirm. No persistence beyond sign templates. |
| Deploy | Docker/Podman + nginx. Vite proxies `/api`. Do not change. |

## Feature inventory

| Feature | Status | UI today | Risk |
|---|---|---|---|
| Mic / Whisper STT | Working | Guest panel only, auto-commits | Add review; keep hook |
| Typed visitor line | Working | Guest composer | Shared composer |
| Staff typed reply + TTS | Working | Employee composer | Keep `makeVoiceNote` / `playVoice` |
| Quick phrases | Working | Employee chips | Shared phrase pad |
| Avatar playback | Working, **not KSL** | Auto-plays on guest text | Honest unavailable + optional demo motion |
| Replay sign / voice | Working | Per-bubble | Keep |
| Camera recognition | Working template match | Employee “Sign to camera” | Coming Soon for live KSL; keep trainer as advanced |
| Dual employee/guest views | Working | Top switch | Shared counter-top is primary |
| End session | Partial (Clear) | No confirm | Confirm + wipe ephemeral data |
| Auth / paid APIs | Absent | — | Do not add |

## Proposed mapping

| New UI | Existing code |
|---|---|
| App shell (tablet 2-pane) | New layout around current state |
| Signing stage | `Avatar3D` / `Avatar` / `useSigner` |
| Speak | `useWhisperListener` |
| Review card | New; feeds existing `addMessage` |
| Type / phrases | Existing composers + `PHRASE_GROUPS` |
| Speak response | `makeVoiceNote` + `playVoice` |
| Conversation | Existing `messages` |
| Taught signs (advanced) | Existing `SignReply` / `SignCamera` |
| End session | New confirm → clear messages, stop mic/avatar, revoke voice URLs |
| Camera “live KSL” | Coming Soon label only |

## Non-destructive choices

- No new backend, env vars, or paid services.
- Placeholder motions stay available only as **“placeholder motion (not KSL)”**.
- Camera trainer stays; it is not presented as live translation.
- Light theme only (`color-scheme: only light`).
