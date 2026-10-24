# ACCESS — Cursor UI Integration Handoff

## Mission
You are a senior frontend engineer and UX implementation lead working **inside the existing Access repository**. The user already has an application with working features. Your job is to inspect it, implement the approved tablet-first responsive UI, and reconnect/reuse the existing features. **Do not rebuild the application, replace working business logic, or fabricate integrations.**

## Required reference files
Read these provided design references, if placed in the repository under `docs/design/`:
- `ACCESS_Gate2_Product_Architecture.md` — product requirements and interaction architecture.
- `ACCESS_Interactive_Prototype.html` — exploratory UI/interaction reference, not production code.
- `ACCESS_Gate6_Usability_Validation_Plan.md` — acceptance and validation criteria.
- `ACCESS_Gate1_Research_Brief.md` — context and assumptions.

The design board image, if provided, is a **visual mood/reference**, not a source of truth for text, localization, KSL accuracy, or technical capabilities. The image incorrectly labels KSL as Korean Sign Language. **KSL here means Kenyan Sign Language.**

## Nonnegotiable product requirements
1. **Light mode only**. No dark-mode switch, dark-theme styles, or automatic OS-dark theme override. Ensure adequate contrast in bright reception environments.
2. **Tablet landscape first**: shared counter-top experience. Signing/visual-output stage is prominent, with conversation context and Speak/Type actions beside it.
3. **Responsive mobile portrait**: stacked signing stage, current message, Speak/Type, quick phrases; preserve essential controls when keyboard opens.
4. **Desktop / large touchscreen**: expanded signing area and conversation panel. Do not simply stretch mobile dimensions.
5. **Equal agency**: Deaf and hearing people can each initiate, respond, correct, replay, clarify, and end a session. Avoid a fixed 'hearing controls everything' workflow.
6. **MVP communication**: speech-to-text, text-to-supported-KSL signing, Deaf participant's typed reply to text and speech, hospitality quick phrases, correction/review, playback, errors and fallbacks. Use only actual supported capabilities.
7. **Camera sign recognition is Coming Soon**, not an operational control unless a real, verified implementation exists. Label clearly and never simulate live translation as if it were real.
8. **KSL correctness**: Never assume English text can be mapped word-for-word to Kenyan Sign Language. Show an honest 'signing unavailable for this message' state if verified content/engine isn't present. No generic hand gestures presented as KSL.
9. **Avatar**: professional semi-realistic appearance, solid non-distracting clothing, clear face/hands/torso, room for signing; existing avatar assets or engine take priority. Avatar platform selection (Avaturn, VRM, MetaHuman) is research, not a mandate to introduce a new dependency. Keep a modular renderer interface.
10. **Privacy**: no persistent conversation history by default; clear ephemeral session data on End Session with confirmation, subject to existing legal/product requirements.
11. **Accessibility**: keyboard navigation, visible focus, semantic labels, large touch targets, screen-reader-friendly statuses, reduced-motion support, text alternatives, accessible contrast. Validate with real KSL users later.
12. **No new authentication, paid APIs, analytics, backend services or external assets without approval**.

## Stage 0 — Inspect before changing anything
- Read README, package manifests, app entry points, routes, component hierarchy, state management, styles, API clients, services, environment variable names, tests, CI and deployment configuration.
- Identify framework, design system, existing responsive behavior and backend interfaces.
- Trace actual code paths for: microphone capture/transcription; text input; KSL/avatar playback; text-to-speech; phrase templates; camera; translation; user/session handling; errors.
- Identify what is working, partial, mocked, or missing. Verify via code and runnable tests, not assumptions.
- Run existing build, lint and tests and record baseline outcomes. Do not delete tests to get green results.
- Create `docs/ACCESS_UI_AUDIT.md` with a feature inventory and mapping from existing components/services to proposed UI components. Mark integration risk and data contracts.
- **Stop and report** if there is a major architectural blocker, absent core services, unclear KSL claims, or a proposed destructive change. Otherwise proceed in small increments.

## Stage 1 — Implement design foundations
- Establish reusable light-theme tokens: neutral backgrounds, restrained green accent, readable typography, spacing, borders, focus, elevation, responsive breakpoints. Treat any supplied hex values as provisional and check contrast.
- Create shared UI primitives consistent with the existing stack. Prefer the repository's current component library; avoid introducing a second design system.
- Implement responsive app shell for tablet, mobile and desktop; keep existing routing and state contracts.
- Avoid replacing working pages wholesale before integrations are mapped.

## Stage 2 — Implement primary communication experience
- Tablet: two-panel layout, left signing/visual stage and right conversation/input panel; quick phrases, settings and End Session accessible.
- Mobile: stacked stage and conversation controls; keyboard-safe input, accessible signing expansion.
- Desktop: expanded layout with the same interaction semantics.
- Explicit states: idle, listening, transcribing, review, translating, signing-ready, playing, typing, speaking, clarification, unsupported-signing, permission-denied, offline/error, ending/cleared.
- Make states observable in the UI, not hidden behind spinners. Support cancel, retry and correction where appropriate.

## Stage 3 — Reconnect existing functionality
For each feature, **reuse the existing implementation** behind the new UI. Keep API request/response shapes and authentication intact. Add adapters only where necessary. Do not silently replace actual functions with demo data.

| UI action | Existing feature to locate and wire | Failure behavior |
|---|---|---|
| Speak | Existing mic / STT hook or service | Permission and recognition errors, retry |
| Review text | Existing transcription state | Editable before submission |
| Show KSL | Existing verified phrase/translation/animation pipeline | Honest unavailable state, text fallback |
| Type | Existing message composer | Input validation, correction |
| Speak response | Existing TTS | Readable text remains available if audio fails |
| Quick phrases | Existing templates / phrase library | Show only available verified signing where relevant |
| Replay | Existing avatar/video playback controls | Disabled if no playable asset |
| Camera | Existing implementation only if verified; otherwise Coming Soon | No deceptive simulated recognition |
| End session | Existing session management | Confirm and clear transient data |

Preserve all working backend integrations, permissions, env configuration, error boundaries, and deployment scripts. Avoid exposing secrets in frontend bundles or logs.

## Stage 4 — Validate and prevent regressions
- Run baseline tests again; add focused tests for responsive rendering, component behavior, feature wiring and errors.
- Add end-to-end smoke tests where the repo supports them: start session, speech result/review, signing available/unavailable, typed reply/TTS, clarification, end session, and mobile layout.
- Verify tablet landscape, mobile portrait and desktop widths, plus zoom and keyboard interactions.
- Ensure the app does not claim real KSL when only placeholders or mock animation are available.
- Test light-only appearance regardless of OS preference.
- Compare against the design reference and document intentional deviations.
- Do not claim KSL linguistic validation or participant usability testing occurred unless evidence exists.

## Deliverables
1. Updated code in the existing repository, with small reviewable commits/diffs.
2. `docs/ACCESS_UI_AUDIT.md` — what existed and what changed.
3. `docs/ACCESS_FEATURE_WIRING.md` — UI action → component → service/API → status (working/partial/missing) and outstanding issues.
4. `docs/ACCESS_UI_QA.md` — commands run, results, responsive screenshots if possible, known limitations.
5. Concise handoff: files changed, reused functionality, new dependencies (if any), remaining tasks and exact steps to run.

## Work style
Do not start by generating a new project or replacing the repository structure. Inspect, plan, implement in increments, test, and report honestly. Prefer preserving stable logic and moving presentation concerns into new components. If requirements conflict with existing capabilities, explain the tradeoff and choose an honest fallback rather than a fake success state.
