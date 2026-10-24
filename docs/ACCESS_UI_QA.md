# ACCESS UI QA

## Commands

```bash
npm run lint    # oxlint — pass (after media.tsx export warning fix)
npm test        # vitest — 5 passed
npm run build   # tsc -b && vite build — pass
```

Baseline before redesign: lint pass, build pass, no tests.

## Checks

| Check | Result |
|---|---|
| Light only (`color-scheme: only light`) | Tokens stay warm paper / green; no dark-mode switch |
| Tablet two-pane (`>=1100px`) | Signing stage left, conversation right (verified in desktop browser) |
| Mobile stacked (`<1100px`) | Stage then comms (verified at 390×844) |
| Desktop wider stage (`>=1280px`) | Expanded avatar height |
| Speak → review → send | Wired to existing Whisper listener |
| Staff phrase / type → TTS | Same `makeVoiceNote` / `playVoice` |
| End session confirm | Clears ephemeral conversation |
| Camera | Coming soon for live KSL; taught matcher under advanced |
| KSL claim | UI never says verified KSL is available |

## Intentional deviations from mood boards

- No Korean Sign Language wording. KSL = Kenyan Sign Language.
- Avatar is still Mixamo Michelle / cartoon until a new rigged model is approved.
- No new paid avatar platform.

## Known limitations

- Browser verification of mic/TTS needs the local speech server.
- Taught-sign camera still needs a secure origin (`localhost` / HTTPS).
- Placeholder motions must not be presented to participants as KSL.
