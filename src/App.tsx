import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Avatar } from './avatar/Avatar'
import { Avatar3D } from './avatar/Avatar3D'
import { useSigner } from './avatar/useSigner'
import { PHRASE_GROUPS, SAMPLE_GUEST_LINES } from './phrases'
import { makeVoiceNote, playVoice, useServerHealth, useWhisperListener, type ServerHealth } from './speech'
import { useCamera, useCameraDevices } from './vision/camera'
import { SignCamera } from './vision/SignCamera'
import {
  confidence,
  loadTemplates,
  saveTemplates,
  type Match,
  type Sequence,
  type SignTemplate,
} from './vision/signRecognizer'
import './App.css'

type From = 'guest' | 'employee'
type Via = 'spoken' | 'typed' | 'phrase' | 'signed'
interface Message {
  id: number
  from: From
  text: string
  at: Date
  via: Via
  voiceUrl?: string | null
  voice?: 'making' | 'ready' | 'none'
}
type View = 'both' | 'employee' | 'guest'
type AvatarStyle = '3d' | 'cartoon'

interface CameraSetting {
  on: boolean
  deviceId: string | undefined
}

const time = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const VIA_LABEL: Record<Via, string> = { spoken: 'spoken', typed: 'typed', phrase: 'quick phrase', signed: 'signed' }

export default function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [view, setView] = useState<View>('both')
  const [alerting, setAlerting] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [sampleIndex, setSampleIndex] = useState(0)
  const [avatarStyle, setAvatarStyle] = useState<AvatarStyle>('3d')
  const [employeeCam, setEmployeeCam] = useState<CameraSetting>({ on: false, deviceId: undefined })
  const [guestCam, setGuestCam] = useState<CameraSetting>({ on: false, deviceId: undefined })
  const nextId = useRef(1)
  const alertTimer = useRef<number | undefined>(undefined)
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
  const onGuestMessage = useCallback(
    (text: string, via: Via = 'spoken') => {
      addMessage({ from: 'guest', text, via })
      flash()
      play(text)
    },
    [addMessage, flash, play],
  )

  const listener = useWhisperListener({ onFinal: onGuestMessage, onSpeechStart: flash })

  const sendReply = useCallback(
    async (text: string, via: Via) => {
      const clean = text.trim()
      if (!clean) return
      const id = addMessage({ from: 'employee', text: clean, via, voice: 'making' })
      setSpeaking(true)
      const url = await makeVoiceNote(clean)
      setMessages((list) => list.map((m) => (m.id === id ? { ...m, voiceUrl: url, voice: url ? 'ready' : 'none' } : m)))
      playVoice(url, clean, () => setSpeaking(false))
    },
    [addMessage],
  )

  const replay = useCallback((m: Message) => {
    setSpeaking(true)
    playVoice(m.voiceUrl, m.text, () => setSpeaking(false))
  }, [])

  const lastGuest = [...messages].reverse().find((m) => m.from === 'guest')
  const lastReply = [...messages].reverse().find((m) => m.from === 'employee')

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            AW
          </span>
          <div>
            <h1>AccessWork</h1>
            <p>Front desk communication · Deaf receptionist ⇄ hearing guest</p>
          </div>
        </div>
        <ServerBadge health={health} />
        <nav className="view-switch" aria-label="Screen layout">
          {(
            [
              ['both', 'Both sides'],
              ['employee', 'Employee screen'],
              ['guest', 'Guest screen'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)}>
              {label}
            </button>
          ))}
        </nav>
      </header>

      <main className={`panels view-${view}`}>
        {view !== 'guest' && (
          <EmployeePanel
            signer={signer}
            avatarStyle={avatarStyle}
            onAvatarStyle={setAvatarStyle}
            alerting={alerting}
            guestHeard={listener.speaking}
            transcribing={listener.transcribing}
            lastGuest={lastGuest}
            onReply={sendReply}
            speaking={speaking}
            camera={employeeCam}
            onCamera={setEmployeeCam}
            stream={employeeStream.stream}
            cameraError={employeeStream.error}
            guestStream={guestStream.stream}
            devices={devices}
          />
        )}
        {view !== 'employee' && (
          <GuestPanel
            listener={listener}
            health={health}
            lastReply={lastReply}
            speaking={speaking}
            onSend={(text) => onGuestMessage(text, 'typed')}
            onSample={() => {
              onGuestMessage(SAMPLE_GUEST_LINES[sampleIndex], 'typed')
              setSampleIndex((i) => (i + 1) % SAMPLE_GUEST_LINES.length)
            }}
            nextSample={SAMPLE_GUEST_LINES[sampleIndex]}
            onReplay={() => lastReply && replay(lastReply)}
            camera={guestCam}
            onCamera={setGuestCam}
            stream={guestStream.stream}
            cameraError={guestStream.error}
            devices={devices}
          />
        )}
      </main>

      <section className="log" aria-label="Conversation">
        <div className="log-head">
          <h2>Conversation</h2>
          {messages.length > 0 && (
            <button className="ghost" onClick={() => setMessages([])}>
              Clear
            </button>
          )}
        </div>
        {messages.length === 0 ? (
          <p className="empty">The exchange between the guest and the receptionist will appear here.</p>
        ) : (
          <ol>
            {messages.map((m) => (
              <li key={m.id} className={`bubble ${m.from}`}>
                <span className="who">
                  {m.from === 'guest' ? 'Guest' : 'Receptionist'} ({VIA_LABEL[m.via]}) · {time(m.at)}
                </span>
                <span className="text">{m.text}</span>
                {m.from === 'guest' ? (
                  <button className="link" onClick={() => signer.play(m.text)}>
                    Sign again
                  </button>
                ) : m.voice === 'making' ? (
                  <span className="note-state">Making voice note…</span>
                ) : m.voiceUrl ? (
                  <audio controls src={m.voiceUrl} className="voice-note" />
                ) : (
                  <button className="link" onClick={() => replay(m)}>
                    Play aloud
                  </button>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}

function ServerBadge({ health }: { health: ServerHealth }) {
  const label =
    health.whisper === 'ready'
      ? `Local Whisper ready (${health.model}${health.device === 'cuda' ? ', GPU' : ''})`
      : health.whisper === 'loading'
        ? 'Local Whisper loading…'
        : health.whisper === 'error'
          ? 'Whisper failed to load'
          : 'Speech server offline: run npm run server'
  return (
    <span className={`server-badge ${health.whisper}`} title={health.error ?? undefined}>
      <span className="dot" aria-hidden /> {label}
    </span>
  )
}

interface CameraControlProps {
  label: string
  camera: CameraSetting
  onCamera: (c: CameraSetting) => void
  devices: MediaDeviceInfo[]
}

function CameraControl({ label, camera, onCamera, devices }: CameraControlProps) {
  return (
    <div className="camera-control">
      <button className={camera.on ? 'active' : ''} onClick={() => onCamera({ ...camera, on: !camera.on })} aria-pressed={camera.on}>
        {camera.on ? `■ Turn off ${label}` : `📷 Turn on ${label}`}
      </button>
      {devices.length > 1 && (
        <select
          aria-label={`Choose ${label}`}
          value={camera.deviceId ?? ''}
          onChange={(e) => onCamera({ ...camera, deviceId: e.target.value || undefined })}
        >
          <option value="">Default camera</option>
          {devices.map((d, i) => (
            <option key={d.deviceId || i} value={d.deviceId}>
              {d.label || `Camera ${i + 1}`}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

function VideoPreview({ stream, className, label }: { stream: MediaStream | null; className?: string; label: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (!ref.current) return
    ref.current.srcObject = stream
    if (stream) ref.current.play().catch(() => {})
  }, [stream])
  if (!stream) return null
  return <video ref={ref} className={className} muted playsInline autoPlay aria-label={label} />
}

type Signer = ReturnType<typeof useSigner>

interface EmployeeProps {
  signer: Signer
  avatarStyle: AvatarStyle
  onAvatarStyle: (s: AvatarStyle) => void
  alerting: boolean
  guestHeard: boolean
  transcribing: boolean
  lastGuest?: Message
  onReply: (text: string, via: Via) => void
  speaking: boolean
  camera: CameraSetting
  onCamera: (c: CameraSetting) => void
  stream: MediaStream | null
  cameraError: string | null
  guestStream: MediaStream | null
  devices: MediaDeviceInfo[]
}

function EmployeePanel(props: EmployeeProps) {
  const { signer, avatarStyle, alerting, guestHeard, transcribing, lastGuest, onReply, speaking } = props
  const [draft, setDraft] = useState('')
  const [group, setGroup] = useState(PHRASE_GROUPS[0].id)
  const phrases = PHRASE_GROUPS.find((g) => g.id === group)?.phrases ?? []

  const submit = (e: FormEvent) => {
    e.preventDefault()
    onReply(draft, 'typed')
    setDraft('')
  }

  const alertText = guestHeard
    ? 'Guest is speaking…'
    : transcribing
      ? 'Writing down what the guest said…'
      : alerting
        ? 'New message from the guest'
        : 'Waiting for the guest'

  return (
    <section className={`panel employee ${alerting || guestHeard ? 'alerting' : ''}`} aria-label="Employee screen">
      <div className="panel-head">
        <span className="tag tag-employee">Employee screen</span>
        <h2>Deaf receptionist</h2>
      </div>

      <div className={`alert ${alerting || guestHeard || transcribing ? 'on' : ''}`} role="status" aria-live="polite">
        <span className="dot" aria-hidden />
        {alertText}
      </div>

      <div className="avatar-card">
        <div className="avatar-stage">
          {avatarStyle === '3d' ? (
            <Avatar3D pose={signer.pose} talking={signer.playing && signer.active >= 0} letter={signer.letter} />
          ) : (
            <Avatar pose={signer.pose} talking={signer.playing && signer.active >= 0} letter={signer.letter} />
          )}
          <VideoPreview stream={props.guestStream} className="guest-pip" label="Guest camera" />
          <div className="style-switch" role="group" aria-label="Avatar style">
            <button className={avatarStyle === '3d' ? 'active' : ''} onClick={() => props.onAvatarStyle('3d')}>
              3D
            </button>
            <button className={avatarStyle === 'cartoon' ? 'active' : ''} onClick={() => props.onAvatarStyle('cartoon')}>
              Cartoon
            </button>
          </div>
        </div>
        <div className="avatar-side">
          <div className="gloss" aria-label="Signed words">
            {signer.glosses.length === 0 ? (
              <span className="gloss-empty">Zuri signs what the guest says.</span>
            ) : (
              signer.glosses.map((g, i) => (
                <span
                  key={i}
                  className={`chip ${g.spelled ? 'spelled' : ''} ${i === signer.active ? 'active' : ''} ${
                    signer.active > i || (!signer.playing && signer.active === -1) ? 'done' : ''
                  }`}
                >
                  {g.label}
                </span>
              ))
            )}
          </div>
          <div className="guest-said">
            <span className="label">Guest said</span>
            <p className="big">{lastGuest ? lastGuest.text : '—'}</p>
          </div>
          <div className="avatar-controls">
            <button disabled={!lastGuest} onClick={() => lastGuest && signer.play(lastGuest.text)}>
              ↻ Sign again
            </button>
            <button disabled={!signer.playing} onClick={signer.stop}>
              ■ Stop
            </button>
            <label>
              Speed
              <select value={signer.speed} onChange={(e) => signer.setSpeed(Number(e.target.value))}>
                <option value={0.6}>Slow</option>
                <option value={1}>Normal</option>
                <option value={1.4}>Fast</option>
              </select>
            </label>
          </div>
          <p className="note">
            Demo signs: Zuri’s movements are placeholders. Signs checked by Deaf KSL signers will replace
            them. Words without a sign are fingerspelled.
          </p>
        </div>
      </div>

      <div className="reply">
        <div className="reply-head">
          <h3>Reply to guest</h3>
          {speaking && <span className="speaking">🔊 Speaking to guest…</span>}
        </div>

        <SignReply
          camera={props.camera}
          onCamera={props.onCamera}
          stream={props.stream}
          cameraError={props.cameraError}
          devices={props.devices}
          group={group}
          onSend={(text) => onReply(text, 'signed')}
        />

        <div className="group-tabs" role="tablist">
          {PHRASE_GROUPS.map((g) => (
            <button
              key={g.id}
              role="tab"
              aria-selected={g.id === group}
              className={g.id === group ? 'active' : ''}
              onClick={() => setGroup(g.id)}
            >
              {g.label}
            </button>
          ))}
        </div>
        <div className="phrases">
          {phrases.map((p) => (
            <button key={p} className="phrase" onClick={() => onReply(p, 'phrase')}>
              {p}
            </button>
          ))}
        </div>
        <form className="composer" onSubmit={submit}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a reply. It is sent as text and a voice note."
            aria-label="Type a reply"
          />
          <button type="submit" className="primary" disabled={!draft.trim()}>
            Send
          </button>
        </form>
      </div>
    </section>
  )
}

interface SignReplyProps {
  camera: CameraSetting
  onCamera: (c: CameraSetting) => void
  stream: MediaStream | null
  cameraError: string | null
  devices: MediaDeviceInfo[]
  group: string
  onSend: (text: string) => void
}

const MAX_SAMPLES = 8

/** Reply by signing to the camera, with a confirm step, plus the trainer for teaching phrases. */
function SignReply({ camera, onCamera, stream, cameraError, devices, group, onSend }: SignReplyProps) {
  const [templates, setTemplates] = useState<SignTemplate[]>(loadTemplates)
  const [matches, setMatches] = useState<Match[] | null>(null)
  const [trainPhrase, setTrainPhrase] = useState<string | null>(null)
  const [trainNote, setTrainNote] = useState<string | null>(null)
  const [showTrainer, setShowTrainer] = useState(false)
  const [custom, setCustom] = useState('')
  const importRef = useRef<HTMLInputElement>(null)

  const updateTemplates = useCallback((next: SignTemplate[]) => {
    setTemplates(next)
    saveTemplates(next)
  }, [])

  const onTrained = useCallback(
    (phrase: string, seq: Sequence | null) => {
      setTrainPhrase(null)
      if (!seq) {
        setTrainNote(`No hands were seen for “${phrase}”. Try again with your hands in view.`)
        return
      }
      const existing = templates.find((t) => t.phrase === phrase)
      const next = existing
        ? templates.map((t) => (t.phrase === phrase ? { ...t, samples: [...t.samples, seq].slice(-MAX_SAMPLES) } : t))
        : [...templates, { phrase, samples: [seq] }]
      updateTemplates(next)
      const count = (existing?.samples.length ?? 0) + 1
      setTrainNote(`Saved sample ${Math.min(count, MAX_SAMPLES)} for “${phrase}”. ${count < 3 ? 'Record 3 or more for better accuracy.' : ''}`)
    },
    [templates, updateTemplates],
  )

  const onRecognized = useCallback((m: Match[]) => setMatches(m.slice(0, 3)), [])

  const groupPhrases = PHRASE_GROUPS.find((g) => g.id === group)?.phrases ?? []
  const known = new Set(PHRASE_GROUPS.flatMap((g) => g.phrases))
  const customPhrases = templates.map((t) => t.phrase).filter((p) => !known.has(p))
  const trainList = [...groupPhrases, ...customPhrases]
  const samplesFor = (p: string) => templates.find((t) => t.phrase === p)?.samples.length ?? 0
  const trainedCount = templates.filter((t) => t.samples.length > 0).length

  const exportTemplates = () => {
    const blob = new Blob([JSON.stringify(templates)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'accesswork-signs.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const importTemplates = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const data = JSON.parse(await file.text()) as SignTemplate[]
      if (!Array.isArray(data)) throw new Error('bad file')
      updateTemplates(data)
      setTrainNote(`Imported ${data.length} phrases.`)
    } catch {
      setTrainNote('That file is not an AccessWork sign file.')
    }
    e.target.value = ''
  }

  const best = matches?.[0]
  const level = matches ? confidence(matches) : 'low'

  return (
    <div className="sign-reply">
      <div className="sign-reply-head">
        <strong>Sign to the camera</strong>
        <CameraControl label="my camera" camera={camera} onCamera={onCamera} devices={devices} />
      </div>
      {cameraError && <p className="warn">{cameraError}</p>}

      {camera.on && (
        <div className="sign-grid">
          <SignCamera
            stream={stream}
            templates={templates}
            trainPhrase={trainPhrase}
            onTrained={onTrained}
            onRecognized={onRecognized}
          />
          <div className="sign-result">
            {best ? (
              <>
                <span className="label">You signed</span>
                <p className="big">{best.phrase}</p>
                <span className={`confidence ${level}`}>
                  {level === 'high' ? 'Strong match' : level === 'medium' ? 'Possible match' : 'Unsure, check before sending'}
                </span>
                <div className="sign-actions">
                  <button
                    className="primary"
                    onClick={() => {
                      onSend(best.phrase)
                      setMatches(null)
                    }}
                  >
                    ✓ Send to guest
                  </button>
                  <button onClick={() => setMatches(null)}>✗ Not this</button>
                </div>
                {matches!.length > 1 && (
                  <div className="alternatives">
                    <span className="label">Or did you mean</span>
                    {matches!.slice(1).map((m) => (
                      <button
                        key={m.phrase}
                        className="phrase"
                        onClick={() => {
                          onSend(m.phrase)
                          setMatches(null)
                        }}
                      >
                        {m.phrase}
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="muted">
                {trainedCount === 0
                  ? 'Zuri does not know your signs yet. Open “Teach my signs” and record each phrase in KSL.'
                  : `Sign one of your ${trainedCount} taught phrases, then lower your hands. You confirm before anything is sent.`}
              </p>
            )}
          </div>
        </div>
      )}

      <button className="link trainer-toggle" onClick={() => setShowTrainer((s) => !s)}>
        {showTrainer ? '▾' : '▸'} Teach my signs ({trainedCount} phrases taught)
      </button>
      {showTrainer && (
        <div className="trainer">
          <p className="note">
            Record yourself signing each phrase in KSL, 3 to 5 times. After a 3-second countdown, sign the phrase
            once. Recordings stay on this device. Uses the phrase group selected below.
          </p>
          {!camera.on && <p className="warn">Turn on your camera to record signs.</p>}
          {trainNote && <p className="train-note">{trainNote}</p>}
          <ul>
            {trainList.map((p) => (
              <li key={p}>
                <span className="train-phrase">{p}</span>
                <span className={`samples ${samplesFor(p) >= 3 ? 'ok' : ''}`}>{samplesFor(p)} samples</span>
                <button disabled={!camera.on || !stream || trainPhrase !== null} onClick={() => setTrainPhrase(p)}>
                  {trainPhrase === p ? 'Recording…' : '● Record'}
                </button>
                <button
                  className="ghost"
                  disabled={samplesFor(p) === 0}
                  onClick={() => updateTemplates(templates.filter((t) => t.phrase !== p))}
                >
                  Clear
                </button>
              </li>
            ))}
          </ul>
          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault()
              const p = custom.trim()
              if (!p || !camera.on || trainPhrase) return
              setTrainPhrase(p)
              setCustom('')
            }}
          >
            <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Add your own phrase to teach" />
            <button type="submit" disabled={!custom.trim() || !camera.on}>
              ● Record
            </button>
          </form>
          <div className="trainer-io">
            <button className="ghost" disabled={templates.length === 0} onClick={exportTemplates}>
              Export signs
            </button>
            <button className="ghost" onClick={() => importRef.current?.click()}>
              Import signs
            </button>
            <input ref={importRef} type="file" accept="application/json" hidden onChange={importTemplates} />
          </div>
        </div>
      )}
    </div>
  )
}

interface GuestProps {
  listener: ReturnType<typeof useWhisperListener>
  health: ServerHealth
  lastReply?: Message
  speaking: boolean
  onSend: (text: string) => void
  onSample: () => void
  nextSample: string
  onReplay: () => void
  camera: CameraSetting
  onCamera: (c: CameraSetting) => void
  stream: MediaStream | null
  cameraError: string | null
  devices: MediaDeviceInfo[]
}

function GuestPanel({ listener, health, lastReply, speaking, onSend, onSample, nextSample, onReplay, ...cam }: GuestProps) {
  const [typed, setTyped] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!typed.trim()) return
    onSend(typed.trim())
    setTyped('')
  }

  const micLabel = !listener.listening
    ? 'Tap to speak'
    : listener.speaking
      ? 'Hearing you…'
      : listener.transcribing
        ? 'Writing it down…'
        : 'Listening… tap to stop'

  return (
    <section className="panel guest" aria-label="Guest screen">
      <div className="panel-head">
        <span className="tag tag-guest">Guest screen</span>
        <h2>Hearing guest</h2>
      </div>

      <div className={`reply-card ${speaking ? 'speaking' : ''}`}>
        <span className="label">Receptionist says</span>
        <p className="big">{lastReply ? lastReply.text : 'Hello! Please speak, and I will reply on this screen.'}</p>
        {lastReply && (
          <div className="voice-row">
            {lastReply.voice === 'making' && <span className="note-state">Making voice note…</span>}
            {lastReply.voiceUrl && <audio controls src={lastReply.voiceUrl} className="voice-note" />}
            <button className="ghost" onClick={onReplay}>
              🔊 Play again
            </button>
            {lastReply.voiceUrl && (
              <a className="link" href={lastReply.voiceUrl} download={`reply-${lastReply.id}.wav`}>
                Download voice note
              </a>
            )}
          </div>
        )}
      </div>

      <div className="mic-area">
        <button
          className={`mic ${listener.listening ? 'on' : ''} ${listener.speaking ? 'hearing' : ''}`}
          onClick={listener.listening ? listener.stop : listener.start}
          aria-pressed={listener.listening}
          disabled={!listener.listening && health.whisper !== 'ready'}
        >
          <span className="mic-icon" aria-hidden>
            🎤
          </span>
          {micLabel}
        </button>
        {listener.listening && (
          <div className="meter" aria-hidden>
            <span style={{ width: `${Math.round(listener.level * 100)}%` }} />
          </div>
        )}
        <p className="live" aria-live="polite">
          {listener.listening
            ? `Mic live${listener.micLabel ? ` · ${listener.micLabel}` : ''}. Speak, then pause.`
            : health.whisper === 'ready'
              ? 'Speech is turned into text on this computer with Whisper.'
              : health.whisper === 'loading'
                ? 'Loading Whisper…'
                : 'Start the speech server to use the microphone: npm run server'}
        </p>
        {listener.error && <p className="warn">{listener.error}</p>}
      </div>

      <form className="composer" onSubmit={submit}>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Or type your message" aria-label="Type your message" />
        <button type="submit" disabled={!typed.trim()}>
          Send
        </button>
      </form>

      <div className="guest-camera">
        <CameraControl label="guest camera" camera={cam.camera} onCamera={cam.onCamera} devices={cam.devices} />
        {cam.cameraError && <p className="warn">{cam.cameraError}</p>}
        <VideoPreview stream={cam.stream} className="guest-video" label="Guest camera preview" />
        {cam.stream && <p className="note">The receptionist sees this camera next to Zuri.</p>}
      </div>

      <button className="sample" onClick={onSample} title="Sends a scripted guest line, for rehearsing the demo">
        <span>Demo line:</span> “{nextSample}”
      </button>
    </section>
  )
}
