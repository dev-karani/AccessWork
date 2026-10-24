import { useCallback, useRef, useState, type ChangeEvent } from 'react'
import { PHRASE_GROUPS } from '../phrases'
import { SignCamera } from '../vision/SignCamera'
import {
  confidence,
  loadTemplates,
  saveTemplates,
  type Match,
  type Sequence,
  type SignTemplate,
} from '../vision/signRecognizer'
import { CameraControl, type CameraSetting } from './media'

const MAX_SAMPLES = 8

interface Props {
  camera: CameraSetting
  onCamera: (c: CameraSetting) => void
  stream: MediaStream | null
  cameraError: string | null
  devices: MediaDeviceInfo[]
  group: string
  onSend: (text: string) => void
}

/** Existing taught-phrase matcher. Not live Kenyan Sign Language recognition. */
export function TaughtSignsPanel({ camera, onCamera, stream, cameraError, devices, group, onSend }: Props) {
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
        <strong>Match a taught phrase</strong>
        <CameraControl label="my camera" camera={camera} onCamera={onCamera} devices={devices} />
      </div>
      <p className="note">
        This matches phrases you recorded on this device. It is not live Kenyan Sign Language translation.
      </p>
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
                <span className="label">Closest taught phrase</span>
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
                    Send
                  </button>
                  <button onClick={() => setMatches(null)}>Not this</button>
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
                  ? 'No phrases taught yet. Open “Teach my signs” and record each phrase.'
                  : `Sign one of your ${trainedCount} taught phrases, then lower your hands. You confirm before anything is sent.`}
              </p>
            )}
          </div>
        </div>
      )}

      <button className="link trainer-toggle" onClick={() => setShowTrainer((s) => !s)}>
        {showTrainer ? 'Hide' : 'Show'} teach my signs ({trainedCount} phrases taught)
      </button>
      {showTrainer && (
        <div className="trainer">
          <p className="note">
            Record yourself signing each phrase, 3 to 5 times. After a 3-second countdown, sign the phrase once.
            Recordings stay on this device.
          </p>
          {!camera.on && <p className="warn">Turn on your camera to record signs.</p>}
          {trainNote && <p className="train-note">{trainNote}</p>}
          <ul>
            {trainList.map((p) => (
              <li key={p}>
                <span className="train-phrase">{p}</span>
                <span className={`samples ${samplesFor(p) >= 3 ? 'ok' : ''}`}>{samplesFor(p)} samples</span>
                <button disabled={!camera.on || !stream || trainPhrase !== null} onClick={() => setTrainPhrase(p)}>
                  {trainPhrase === p ? 'Recording…' : 'Record'}
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
              Record
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
