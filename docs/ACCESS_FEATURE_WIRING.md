# ACCESS feature wiring

| UI action | Component | Service / API | Status | Notes |
|---|---|---|---|---|
| Speak | `SpeakBlock` → `useWhisperListener` | `POST /api/transcribe` | Working | Opens review card; does not auto-commit |
| Review text | `ReviewCard` | In-memory draft | Working | Editable; Visitor / Colleague |
| Show KSL | Signing stage | None verified | Missing (honest) | Banner: signing unavailable as KSL |
| Placeholder motion | `useSigner.play` | Local gloss list | Partial | Explicitly labelled not KSL; not auto-played |
| Type | `Composer` | Same `addMessage` path | Working | Goes through review |
| Quick phrases | `PhrasePad` / `PHRASE_GROUPS` | Local list | Working | Staff-side send via review |
| Speak response | `makeVoiceNote` / `playVoice` | `POST /api/tts` | Working | Text remains if audio fails |
| Replay voice | Conversation log | Existing blob URL / speechSynthesis | Working | |
| Replay motion | Conversation log | `useSigner` | Partial | Placeholder only |
| Live camera KSL | Coming soon chip | — | Missing | Not simulated |
| Taught phrase match | `TaughtSignsPanel` | MediaPipe + localStorage | Working (advanced) | Confirm before send; not KSL |
| End session | Dialog | Clears messages, stops mic/avatar, revokes voice URLs | Working | Taught templates kept |
| Auth | — | — | Absent | Unchanged |
| Health | `ServerBadge` | `GET /api/health` | Working | |

## Outstanding

- No verified KSL content or engine.
- No usability testing with Deaf KSL users.
- Speech still needs `npm run server` / Docker.
- Dual-screen employee/guest split is no longer the default; shared tablet is.
