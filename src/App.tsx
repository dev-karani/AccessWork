import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Avatar } from './avatar/Avatar'
import { Avatar3D } from './avatar/Avatar3D'
import { signingAvailability, signingStageCopy, tokenKind, tokenKindLabel } from './avatar/signingAvailability'
import { useSigner } from './avatar/useSigner'
import { PHRASE_GROUPS, SAMPLE_GUEST_LINES } from './phrases'
import { formatTime, ROLE_LABEL, type From, type Message, type Via } from './session/types'
import { makeVoiceNote, playVoice, useServerHealth, useWhisperListener, userFacingSpeechError, type ServerHealth } from './speech'
import { TaughtSignsPanel } from './ui/TaughtSignsPanel'
import { CameraControl, VideoPreview, type CameraSetting } from './ui/media'
import { useCamera, useCameraDevices } from './vision/camera'
import './App.css'

type AvatarStyle = '3d' | 'cartoon'
type View = 'both' | 'employee' | 'guest'

type SessionPhase =
  | 'idle'
  | 'listening'
  | 'transcribing'
  | 'playing'
  | 'speaking'
  | 'permission-denied'
  | 'offline'
  | 'ending'

export default function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [view, setView] = useState<View>('both')
  const [speaker, setSpeaker] = useState<From>('guest')
  const [alerting, setAlerting] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [ending, setEnding] = useState(false)
  const [sampleIndex, setSampleIndex] = useState(0)
  const [avatarStyle, setAvatarStyle] = useState<AvatarStyle>('3d')
  const [phraseGroup, setPhraseGroup] = useState(PHRASE_GROUPS[0].id)
  const [employeeCam, setEmployeeCam] = useState<CameraSetting>({ on: false, deviceId: undefined })
  const [guestCam, setGuestCam] = useState<CameraSetting>({ on: false, deviceId: undefined })
  const [showPhrases, setShowPhrases] = useState(false)
  const [sheet, setSheet] = useState<'none' | 'settings' | 'camera'>('none')
  const [draft, setDraft] = useState('')
  const [showEmoji, setShowEmoji] = useState(false)
  const [replaying, setReplaying] = useState(false)
  const [avatarStatus, setAvatarStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const nextId = useRef(1)
  const alertTimer = useRef<number | undefined>(undefined)
  const pendingReplay = useRef(false)
  const me: From = view === 'guest' ? 'guest' : view === 'employee' ? 'employee' : speaker
  const signer = useSigner()
  const health = useServerHealth()
  const { devices, refresh: refreshDevices } = useCameraDevices()
  const employeeStream = useCamera(employeeCam.on, employeeCam.deviceId, refreshDevices)
  const guestStream = useCamera(guestCam.on, guestCam.deviceId, refreshDevices)

  const flash = useCallback(() => {
    setAlerting(true)
    if (navigator.vibrate) navigator.vibrate(120)
    window.clearTimeout(alertTimer.current)
    alertTimer.current = window.setTimeout(() => setAlerting(false), 2500)
  }, [])

  const addMessage = useCallback((m: Omit<Message, 'id' | 'at'>) => {
    const id = nextId.current++
    setMessages((list) => [...list, { ...m, id, at: new Date() }])
    return id
  }, [])

  const { play } = signer

  const sendNow = useCallback(
    async (text: string, via: Via, from: From, recorded?: string | null) => {
      const clean = text.trim()
      if (!clean) return
      const id = addMessage({ from, text: clean, via, voice: recorded ? 'ready' : 'making', voiceUrl: recorded ?? undefined })
      if (from === 'guest') {
        flash()
        setReplaying(false)
        play(clean)
      }
      if (!recorded) {
        const url = await makeVoiceNote(clean)
        setMessages((list) => list.map((m) => (m.id === id ? { ...m, voiceUrl: url, voice: url ? 'ready' : 'none' } : m)))
      }
    },
    [addMessage, flash, play],
  )

  const listener = useWhisperListener({
    onFinal: (text, wav) => {
      const recorded = wav ? URL.createObjectURL(wav) : null
      void sendNow(text, 'spoken', me, recorded)
    },
    onSpeechStart: flash,
  })

  const sendDirect = useCallback(
    (text: string, via: Via, from: From) => {
      void sendNow(text, via, from)
    },
    [sendNow],
  )

  const replayVoice = useCallback((m: Message) => {
    setSpeaking(true)
    playVoice(m.voiceUrl, m.text, () => setSpeaking(false))
  }, [])

  const endSession = useCallback(() => {
    listener.stop()
    signer.stop()
    messages.forEach((m) => {
      if (m.voiceUrl) URL.revokeObjectURL(m.voiceUrl)
    })
    setMessages([])
    setAlerting(false)
    setSpeaking(false)
    setEnding(false)
    setEmployeeCam((c) => ({ ...c, on: false }))
    setGuestCam((c) => ({ ...c, on: false }))
  }, [listener, messages, signer])

  const lastGuest = [...messages].reverse().find((m) => m.from === 'guest')
  const focusText = lastGuest?.text ?? ''
  const signing = useMemo(() => signingAvailability(focusText), [focusText])
  const stageCopy = useMemo(
    () =>
      signingStageCopy(focusText, {
        playing: signer.playing,
        replaying,
        processing: listener.transcribing || avatarStatus === 'loading',
        error: avatarStatus === 'error',
      }),
    [avatarStatus, focusText, listener.transcribing, replaying, signer.playing],
  )

  useEffect(() => {
    if (signer.playing) {
      if (pendingReplay.current) {
        pendingReplay.current = false
        setReplaying(true)
      }
      return
    }
    setReplaying(false)
  }, [signer.playing])

  const replaySign = useCallback(
    (text: string) => {
      pendingReplay.current = true
      setReplaying(true)
      play(text)
    },
    [play],
  )

  const phase: SessionPhase = ending
    ? 'ending'
    : listener.error?.includes('blocked')
      ? 'permission-denied'
      : health.whisper === 'offline' && !listener.listening
        ? 'offline'
        : listener.transcribing
          ? 'transcribing'
          : listener.listening
            ? 'listening'
            : signer.playing
              ? 'playing'
              : speaking
                ? 'speaking'
                : 'idle'

  const statusText = statusLabel(phase, health, listener, speaking, alerting)

  useEffect(() => {
    if (view === 'guest') setSpeaker('guest')
    if (view === 'employee') setSpeaker('employee')
  }, [view])

  const sendTyped = () => {
    if (!draft.trim()) return
    sendDirect(draft, 'typed', me)
    setDraft('')
  }

  return (
    <div className={`app view-${view} ${alerting || listener.speaking ? 'is-alert' : ''}`}>
      <header className="topbar">
        <h1 className="wordmark">access.</h1>
        <nav className="view-switch" aria-label="Demo view">
          {(
            [
              ['both', 'Both'],
              ['employee', 'Receptionist'],
              ['guest', 'Guest'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)}>
              {label}
            </button>
          ))}
        </nav>
        <p className="lang-pair">English · Sign</p>
        <ServerBadge health={health} />
        <button className="icon-btn" onClick={() => setSheet(sheet === 'settings' ? 'none' : 'settings')} aria-label="Settings">
          <IconGear />
        </button>
      </header>

      <p className={`live-status phase-${phase}`} role="status" aria-live="polite">
        {statusText}
      </p>

      <div className="toolbar">
        <button className={showPhrases ? 'on' : ''} onClick={() => setShowPhrases((v) => !v)}>
          <IconList /> Common phrases
        </button>
        <button onClick={() => setSheet(sheet === 'camera' ? 'none' : 'camera')}>
          <IconCam /> Camera input <span className="soon">Soon</span>
        </button>
        <button className="end" onClick={() => setEnding(true)} disabled={messages.length === 0}>
          End session
        </button>
      </div>

      <main className="desk">
        {view !== 'guest' && (
          <section className="stage" aria-label="Signing stage">
            <div className="avatar-frame">
              {avatarStyle === '3d' ? (
                <Avatar3D
                  pose={signer.pose}
                  talking={signer.playing && signer.active >= 0}
                  letter={signer.letter}
                  onStatus={setAvatarStatus}
                />
              ) : (
                <Avatar pose={signer.pose} talking={signer.playing && signer.active >= 0} letter={signer.letter} />
              )}
              <VideoPreview stream={guestStream.stream} className="guest-pip" label="Guest camera preview" />
              <button className="expand" aria-label="Focus signer" onClick={() => setView('employee')}>
                <IconExpand />
              </button>
            </div>
            <div className="gloss-strip" aria-live="polite">
              <div className="stage-caption">
                <span className={`stage-status ${stageCopy.status === 'Signing' || stageCopy.status === 'Replay' ? 'live' : ''}`}>
                  {stageCopy.status}
                </span>
                {stageCopy.caption && <p className="gloss-source">{stageCopy.caption}</p>}
              </div>
              {signer.glosses.length > 0 && (
                <div className="gloss-chips">
                  {signer.glosses.map((g, i) => {
                    const kind = tokenKind(g)
                    return (
                      <span key={`${g.label}-${i}`} className={`gloss-chip ${i === signer.active ? 'active' : ''}`}>
                        {g.label}
                        <span className="kind">{tokenKindLabel(kind)}</span>
                      </span>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="stage-tools">
              <button className="circle-sm" disabled={!signer.playing} onClick={signer.stop} aria-label="Stop signing">
                <IconPause />
              </button>
              <span className="speed">{signer.speed.toFixed(1)}×</span>
              <button
                className="circle-sm"
                disabled={!signing.demoAvailable || !focusText}
                onClick={() => replaySign(focusText)}
                aria-label="Replay guest line"
              >
                <IconReplay />
              </button>
            </div>
          </section>
        )}

        <aside className="comms" aria-label="Conversation">
          <header className="comms-head">
            <div>
              <h2>Conversation</h2>
              <p>{ROLE_LABEL[me]}</p>
            </div>
          </header>
          <ConversationLog
            self={me}
            messages={messages}
            onReplaySign={(m) => {
              if (m.from !== 'guest') return
              replaySign(m.text)
            }}
            onReplayVoice={replayVoice}
          />
          <div className="comms-dock">
            {showPhrases && (
              <PhrasePad
                group={phraseGroup}
                onGroup={setPhraseGroup}
                onPick={(p) => {
                  sendDirect(p, 'phrase', 'employee')
                  setShowPhrases(false)
                }}
              />
            )}
            {showEmoji && (
              <EmojiPad
                onPick={(emoji) => {
                  setDraft((d) => d + emoji)
                  setShowEmoji(false)
                }}
              />
            )}
            <div className="from-row" aria-label="Message from">
              <span>Message from</span>
              {view === 'both' ? (
                <div className="view-switch">
                  <button className={speaker === 'guest' ? 'active' : ''} onClick={() => setSpeaker('guest')}>
                    Guest
                  </button>
                  <button className={speaker === 'employee' ? 'active' : ''} onClick={() => setSpeaker('employee')}>
                    Receptionist
                  </button>
                </div>
              ) : (
                <strong>{ROLE_LABEL[me]}</strong>
              )}
            </div>
            {listener.listening ? (
              <RecMeter level={listener.level} speaking={listener.speaking} onStop={listener.stop} />
            ) : (
              <div className="composer">
                <button
                  className={`composer-icon ${showPhrases ? 'on' : ''}`}
                  onClick={() => {
                    setShowEmoji(false)
                    setShowPhrases((v) => !v)
                  }}
                  aria-label="Common phrases"
                  aria-expanded={showPhrases}
                >
                  <IconList />
                </button>
                <button
                  className={`composer-icon ${showEmoji ? 'on' : ''}`}
                  onClick={() => {
                    setShowPhrases(false)
                    setShowEmoji((v) => !v)
                  }}
                  aria-label="Emoji"
                  aria-expanded={showEmoji}
                >
                  <IconEmoji />
                </button>
                <button
                  className="composer-icon"
                  onClick={() => void listener.start()}
                  disabled={health.whisper !== 'ready'}
                  aria-label="Voice message"
                >
                  <IconMic />
                </button>
                <input
                  className="composer-input"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={listener.transcribing ? 'Writing speech down…' : 'Type a message'}
                  aria-label="Message"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') sendTyped()
                  }}
                />
                <button className="composer-send" onClick={sendTyped} disabled={!draft.trim()} aria-label="Send">
                  <IconSend />
                </button>
              </div>
            )}
            {listener.error && (
              <>
                <p className="warn">{userFacingSpeechError(listener.error)}</p>
                <div className="mic-recover">
                  <button type="button" onClick={() => void listener.start()} disabled={health.whisper !== 'ready'}>
                    Try again
                  </button>
                </div>
              </>
            )}
          </div>
        </aside>
      </main>

      {sheet === 'settings' && (
        <div className="sheet" role="dialog" aria-label="Settings">
          <div className="sheet-card">
            <header>
              <h2>Languages</h2>
              <button onClick={() => setSheet('none')} aria-label="Close">
                ×
              </button>
            </header>
            <p className="muted">Spoken language (input)</p>
            <div className="setting-row">English</div>
            <p className="swap">↕</p>
            <p className="muted">Sign language (output)</p>
            <div className="setting-row">Kenyan Sign Language (KSL)</div>
            <p className="note">KSL here means Kenyan Sign Language, not Korean.</p>
            <p className="muted">Avatar</p>
            <div className="view-switch">
              <button className={avatarStyle === '3d' ? 'active' : ''} onClick={() => setAvatarStyle('3d')}>
                3D
              </button>
              <button className={avatarStyle === 'cartoon' ? 'active' : ''} onClick={() => setAvatarStyle('cartoon')}>
                Cartoon
              </button>
            </div>
            <label className="speed-row">
              Sign speed
              <select value={signer.speed} onChange={(e) => signer.setSpeed(Number(e.target.value))}>
                <option value={0.6}>0.6×</option>
                <option value={1}>1.0×</option>
                <option value={1.4}>1.4×</option>
              </select>
            </label>
            <button
              className="text-btn"
              onClick={() => {
                sendDirect(SAMPLE_GUEST_LINES[sampleIndex], 'typed', 'guest')
                setSampleIndex((i) => (i + 1) % SAMPLE_GUEST_LINES.length)
                setSheet('none')
              }}
            >
              Send demo guest line
            </button>
          </div>
        </div>
      )}

      {sheet === 'camera' && (
        <div className="sheet" role="dialog" aria-label="Camera input">
          <div className="sheet-card">
            <header>
              <h2>Sign to camera</h2>
              <button onClick={() => setSheet('none')} aria-label="Close">
                ×
              </button>
            </header>
            <div className="soon-hero">
              <span className="soon">Soon</span>
              <p>We’re working on live sign-language interpretation.</p>
            </div>
            <TaughtSignsPanel
              camera={employeeCam}
              onCamera={setEmployeeCam}
              stream={employeeStream.stream}
              cameraError={employeeStream.error}
              devices={devices}
              group={phraseGroup}
              onSend={(text) => {
                sendDirect(text, 'signed', 'employee')
                setSheet('none')
              }}
            />
            <div className="guest-camera">
              <CameraControl label="guest camera" camera={guestCam} onCamera={setGuestCam} devices={devices} />
              {guestStream.error && <p className="warn">{guestStream.error}</p>}
              <VideoPreview stream={guestStream.stream} className="guest-video" label="Guest camera preview" />
            </div>
          </div>
        </div>
      )}

      {ending && (
        <dialog className="end-dialog" open aria-labelledby="end-title">
          <h2 id="end-title">End this session?</h2>
          <p>This clears the conversation on this screen. Taught signs stay on the device.</p>
          <div className="end-actions">
            <button className="fill-danger" onClick={endSession}>
              End and clear
            </button>
            <button onClick={() => setEnding(false)}>Keep talking</button>
          </div>
        </dialog>
      )}
    </div>
  )
}

function statusLabel(
  phase: SessionPhase,
  health: ServerHealth,
  listener: ReturnType<typeof useWhisperListener>,
  speaking: boolean,
  alerting: boolean,
) {
  if (phase === 'ending') return 'Ending session…'
  if (phase === 'permission-denied') return userFacingSpeechError(listener.error)
  if (phase === 'offline') return 'Speech is offline. You can type.'
  if (listener.speaking) return 'Hearing speech…'
  if (phase === 'transcribing') return 'Writing speech down…'
  if (phase === 'listening') return 'Listening'
  if (phase === 'playing') return 'Signing'
  if (speaking) return 'Playing voice note'
  if (alerting) return 'New speech'
  if (health.whisper === 'loading') return 'Loading speech…'
  return 'Ready'
}

function ServerBadge({ health }: { health: ServerHealth }) {
  const label =
    health.whisper === 'ready'
      ? `Local Whisper ready (${health.model}${health.device === 'cuda' ? ', GPU' : ''})`
      : health.whisper === 'loading'
        ? 'Local Whisper loading…'
        : health.whisper === 'error'
          ? 'Whisper failed to load'
          : 'Speech server offline'
  return (
    <span className={`server-badge ${health.whisper}`} title={health.error ?? undefined}>
      <span className="dot" aria-hidden /> {label}
    </span>
  )
}

function PhrasePad({
  group,
  onGroup,
  onPick,
}: {
  group: string
  onGroup: (id: string) => void
  onPick: (phrase: string) => void
}) {
  const phrases = PHRASE_GROUPS.find((g) => g.id === group)?.phrases ?? []
  return (
    <div className="phrase-pad">
      <div className="group-tabs" role="tablist" aria-label="Quick phrases">
        {PHRASE_GROUPS.map((g) => (
          <button
            key={g.id}
            role="tab"
            aria-selected={g.id === group}
            className={g.id === group ? 'active' : ''}
            onClick={() => onGroup(g.id)}
          >
            {g.label}
          </button>
        ))}
      </div>
      <div className="phrases">
        {phrases.map((p) => (
          <button key={p} className="phrase" onClick={() => onPick(p)}>
            {p}
          </button>
        ))}
      </div>
    </div>
  )
}

function RecMeter({ level, speaking, onStop }: { level: number; speaking: boolean; onStop: () => void }) {
  const [sec, setSec] = useState(0)
  useEffect(() => {
    const t = window.setInterval(() => setSec((n) => n + 1), 1000)
    return () => window.clearInterval(t)
  }, [])
  return (
    <div className={`rec-meter ${speaking ? 'hot' : ''}`} role="status" aria-label="Recording">
      <button type="button" className="composer-icon live" onClick={onStop} aria-label="Stop recording">
        <IconMic />
      </button>
      <div className="rec-wave" aria-hidden>
        {Array.from({ length: 28 }, (_, i) => {
          const pulse = Math.abs(Math.sin(i * 0.55 + level * 9))
          const h = 0.18 + pulse * (0.22 + level * 0.6)
          return <span key={i} style={{ height: `${Math.round(h * 100)}%` }} />
        })}
      </div>
      <span className="rec-time">
        0:{String(Math.min(sec, 59)).padStart(2, '0')}
      </span>
    </div>
  )
}

const EMOJIS = ['😀', '😂', '😊', '😍', '🙌', '👍', '👋', '🙏', '❤️', '🔥', '✅', '❗', '🏨', '🛎️', '🧳', '🔑', '🛏️', '☕', '🍽️', '📍']

function EmojiPad({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <div className="emoji-pad" role="listbox" aria-label="Emoji">
      {EMOJIS.map((emoji) => (
        <button key={emoji} type="button" onClick={() => onPick(emoji)}>
          {emoji}
        </button>
      ))}
    </div>
  )
}

function ConversationLog({
  self,
  messages,
  onReplaySign,
  onReplayVoice,
}: {
  self: From
  messages: Message[]
  onReplaySign: (m: Message) => void
  onReplayVoice: (m: Message) => void
}) {
  const end = useRef<HTMLLIElement | null>(null)
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  return (
    <ol className="log">
      {messages.length > 0 && <li className="day-chip">Today</li>}
      {messages.map((m) => (
        <li key={m.id} className={`row ${m.from === self ? 'mine' : 'theirs'}`}>
          <div className={`bubble ${m.from === self ? 'mine' : 'theirs'}`}>
            <span className="who">{m.from === self ? `You · ${ROLE_LABEL[m.from]}` : ROLE_LABEL[m.from]}</span>
            <span className="text">{m.text}</span>
            {m.voice === 'making' && <span className="vn-wait">Making voice note…</span>}
            {m.voiceUrl && (
              <button type="button" className="vn" onClick={() => onReplayVoice(m)}>
                <span className="play">▶</span>
                <span className="wave" aria-hidden />
                <span>Play</span>
              </button>
            )}
            <span className="meta">
              <span className="when">{formatTime(m.at)}</span>
              {m.from === 'guest' && (
                <button type="button" className="mini" onClick={() => onReplaySign(m)}>
                  Sign
                </button>
              )}
            </span>
          </div>
        </li>
      ))}
      <li ref={end} className="log-end" aria-hidden />
    </ol>
  )
}

function IconGear() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
    </svg>
  )
}
function IconList() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M8 7h13M8 12h13M8 17h13M3 7h.01M3 12h.01M3 17h.01" />
    </svg>
  )
}
function IconCam() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="7" width="13" height="10" rx="2" />
      <path d="M16 10l5-3v10l-5-3z" />
    </svg>
  )
}
function IconExpand() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
    </svg>
  )
}
function IconPause() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <rect x="7" y="6" width="3" height="12" rx="1" />
      <rect x="14" y="6" width="3" height="12" rx="1" />
    </svg>
  )
}
function IconReplay() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 12a8 8 0 1 0 2-5.3M4 4v5h5" />
    </svg>
  )
}
function IconMic() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6 11a6 6 0 0 0 12 0M12 17v4M8 21h8" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}
function IconEmoji() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 10h.01M16 10h.01M8.5 15c1.2 1.2 5.8 1.2 7 0" />
    </svg>
  )
}
function IconSend() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 12h14M13 6l6 6-6 6" />
    </svg>
  )
}
