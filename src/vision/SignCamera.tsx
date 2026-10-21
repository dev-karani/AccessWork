import { useEffect, useRef, useState } from 'react'
import { HandLandmarker, type HandLandmarkerResult } from '@mediapipe/tasks-vision'
import {
  classify,
  getHandLandmarker,
  hasHands,
  prepareSequence,
  SignSegmenter,
  toFeatures,
  type Features,
  type Match,
  type Sequence,
  type SignTemplate,
} from './signRecognizer'

const COUNTDOWN_MS = 3000
const RECORD_MS = 2600

type Phase = { kind: 'idle' } | { kind: 'countdown'; until: number } | { kind: 'recording'; until: number }

interface Props {
  stream: MediaStream | null
  templates: SignTemplate[]
  /** When set, record one training sample for this phrase. */
  trainPhrase: string | null
  onTrained: (phrase: string, seq: Sequence | null) => void
  onRecognized: (matches: Match[]) => void
}

function drawHands(ctx: CanvasRenderingContext2D, result: HandLandmarkerResult, w: number, h: number) {
  ctx.clearRect(0, 0, w, h)
  ctx.lineWidth = Math.max(2, w / 260)
  for (const lm of result.landmarks) {
    ctx.strokeStyle = 'rgba(232, 169, 46, 0.95)'
    for (const { start, end } of HandLandmarker.HAND_CONNECTIONS) {
      ctx.beginPath()
      ctx.moveTo(lm[start].x * w, lm[start].y * h)
      ctx.lineTo(lm[end].x * w, lm[end].y * h)
      ctx.stroke()
    }
    ctx.fillStyle = '#0f6b63'
    for (const p of lm) {
      ctx.beginPath()
      ctx.arc(p.x * w, p.y * h, Math.max(2.5, w / 200), 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

/**
 * Camera view for the Deaf employee. Tracks both hands, splits signing into individual signs,
 * and matches each sign against the phrases the employee has taught it.
 */
export function SignCamera({ stream, templates, trainPhrase, onTrained, onRecognized }: Props) {
  const video = useRef<HTMLVideoElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [capture, setCapture] = useState<string | null>(null)
  const [handsVisible, setHandsVisible] = useState(false)
  const [signing, setSigning] = useState(false)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [now, setNow] = useState(0)

  const props = useRef({ templates, trainPhrase, onTrained, onRecognized })
  const phaseRef = useRef<Phase>(phase)
  useEffect(() => {
    props.current = { templates, trainPhrase, onTrained, onRecognized }
  }, [templates, trainPhrase, onTrained, onRecognized])
  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    if (!trainPhrase) return
    const start = performance.now()
    phaseRef.current = { kind: 'countdown', until: start + COUNTDOWN_MS }
    // Starting the countdown mirrors an external request (the parent asked to record).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhase(phaseRef.current)
  }, [trainPhrase])

  useEffect(() => {
    const v = video.current
    if (!v) return
    v.srcObject = stream
    const play = () => v.play().catch(() => {})
    v.addEventListener('loadedmetadata', play)
    if (stream) play()
    const check = window.setInterval(() => {
      if (v.videoWidth > 0) {
        setCapture(`${v.videoWidth}×${v.videoHeight}`)
        window.clearInterval(check)
      }
    }, 250)
    const fail = window.setTimeout(() => {
      if (stream && v.videoWidth === 0) setLoadError('The camera is on, but no picture arrived. Close other apps using it, then turn the camera off and on.')
    }, 4000)
    return () => {
      v.removeEventListener('loadedmetadata', play)
      window.clearInterval(check)
      window.clearTimeout(fail)
    }
  }, [stream])

  useEffect(() => {
    if (!stream) return
    let cancelled = false
    let frameId = 0
    let lastTime = -1
    const segmenter = new SignSegmenter()
    let recorded: Array<{ f: Features; hands: boolean }> = []
    let lastHands = false
    let lastSigning = false

    getHandLandmarker()
      .then((lm) => {
        if (cancelled) return
        setReady(true)
        const loop = () => {
          frameId = requestAnimationFrame(loop)
          const v = video.current
          const c = canvas.current
          if (!v || !c || v.readyState < 2 || v.currentTime === lastTime) return
          lastTime = v.currentTime
          const t = performance.now()
          const result = lm.detectForVideo(v, t)
          if (c.width !== v.videoWidth) {
            c.width = v.videoWidth
            c.height = v.videoHeight
          }
          const ctx = c.getContext('2d')
          if (ctx) drawHands(ctx, result, c.width, c.height)

          const hands = hasHands(result)
          const f = toFeatures(result)
          if (hands !== lastHands) {
            lastHands = hands
            setHandsVisible(hands)
          }

          const ph = phaseRef.current
          if (ph.kind === 'countdown') {
            setNow(t)
            if (t >= ph.until) {
              recorded = []
              phaseRef.current = { kind: 'recording', until: t + RECORD_MS }
              setPhase(phaseRef.current)
            }
            return
          }
          if (ph.kind === 'recording') {
            setNow(t)
            recorded.push({ f, hands })
            if (t >= ph.until) {
              const phrase = props.current.trainPhrase
              phaseRef.current = { kind: 'idle' }
              setPhase(phaseRef.current)
              segmenter.reset()
              if (phrase) props.current.onTrained(phrase, prepareSequence(recorded))
            }
            return
          }

          const clip = segmenter.push(f, hands)
          if (segmenter.signing !== lastSigning) {
            lastSigning = segmenter.signing
            setSigning(lastSigning)
          }
          if (clip && props.current.templates.length) props.current.onRecognized(classify(clip, props.current.templates))
        }
        loop()
      })
      .catch((e: unknown) => {
        console.error(e)
        if (!cancelled) setLoadError('Hand tracking could not start in this browser.')
      })

    return () => {
      cancelled = true
      cancelAnimationFrame(frameId)
    }
  }, [stream])

  let status: string
  if (!stream) status = 'Camera is off'
  else if (loadError) status = loadError
  else if (!ready) status = capture ? `Camera live ${capture}. Starting hand tracking…` : 'Starting camera…'
  else if (phase.kind === 'countdown') status = `Get ready to sign “${trainPhrase}”… ${Math.max(1, Math.ceil((phase.until - now) / 1000))}`
  else if (phase.kind === 'recording') status = `Recording… sign “${trainPhrase}” now`
  else if (templates.length === 0) status = 'Teach Zuri your signs below, then sign a phrase to reply'
  else if (signing) status = 'Signing… lower your hands when you finish'
  else if (handsVisible) status = `Camera capturing${capture ? ` ${capture}` : ''}. Hands seen.`
  else status = `Camera capturing${capture ? ` ${capture}` : ''}. Raise your hands to sign a reply.`

  return (
    <div className={`sign-camera ${phase.kind !== 'idle' ? 'training' : ''} ${signing ? 'signing' : ''}`}>
      <div className="sign-video">
        <video ref={video} muted playsInline autoPlay />
        <canvas ref={canvas} />
        {phase.kind === 'countdown' && (
          <div className="countdown">{Math.max(1, Math.ceil((phase.until - now) / 1000))}</div>
        )}
        {phase.kind === 'recording' && <div className="rec-dot">● REC</div>}
      </div>
      <p className="sign-status" aria-live="polite">
        {status}
      </p>
    </div>
  )
}
