import { useCallback, useEffect, useRef, useState } from 'react'

/** Map raw browser / server failures to a short guest-facing line. */
export function userFacingSpeechError(raw: string | null | undefined): string {
  const msg = (raw ?? '').trim()
  if (!msg) return 'Something went wrong with speech. You can keep typing.'
  if (/blocked|NotAllowed/i.test(msg)) return 'Microphone access was blocked. Allow it for this site, or type instead.'
  if (/No microphone|NotFound/i.test(msg)) return 'No microphone was found. Connect one, or type instead.'
  if (/Failed to fetch|not running|npm run server|JSON/i.test(msg) || /\b500\b/.test(msg)) {
    return 'Speech is offline. You can keep typing.'
  }
  if (/No sound|Chipset|HD Audio|Digital Microphone|no live audio/i.test(msg)) {
    return "Microphone isn't receiving audio. Check the connection or choose another input. You can keep typing."
  }
  if (/secure page|HTTPS/i.test(msg)) return 'The microphone needs a secure page. You can keep typing.'
  if (/type instead|keep typing/i.test(msg) && !/Chipset|HD Audio|Digital Microphone|DeviceId/i.test(msg)) return msg
  return 'Something went wrong with speech. You can keep typing.'
}

export interface ServerHealth {
  whisper: 'ready' | 'loading' | 'error' | 'offline'
  model?: string
  device?: string | null
  error?: string | null
  tts?: string | null
}

/** Poll the local speech server (Whisper + TTS) so the UI can show whether it is ready. */
export function useServerHealth() {
  const [health, setHealth] = useState<ServerHealth>({ whisper: 'offline' })
  useEffect(() => {
    let alive = true
    let timer = 0
    const check = async () => {
      try {
        const res = await fetch('/api/health')
        if (!res.ok) throw new Error(String(res.status))
        const data = (await res.json()) as ServerHealth
        if (alive) setHealth(data)
      } catch {
        if (alive) setHealth({ whisper: 'offline' })
      }
      if (alive) timer = window.setTimeout(check, 4000)
    }
    check()
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [])
  return health
}

const WORKLET = `
class AwRecorder extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (ch) this.port.postMessage(ch.slice(0))
    return true
  }
}
registerProcessor('aw-recorder', AwRecorder)
`

const TARGET_RATE = 16000
const FRAME_MS = 20
const PREROLL_MS = 350
const START_FRAMES = 3
const END_SILENCE_MS = 900
const MIN_SPEECH_MS = 450
const MAX_SPEECH_MS = 15000

function downsample(input: Float32Array, rate: number): Float32Array {
  if (rate === TARGET_RATE) return input
  const ratio = rate / TARGET_RATE
  const out = new Float32Array(Math.floor(input.length / ratio))
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio)
    const end = Math.min(input.length, Math.floor((i + 1) * ratio))
    let sum = 0
    for (let j = start; j < end; j++) sum += input[j]
    out[i] = sum / Math.max(1, end - start)
  }
  return out
}

function encodeWav(samples: Float32Array, rate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const write = (offset: number, s: string) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)))
  write(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  write(8, 'WAVE')
  write(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  write(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

function concat(chunks: Float32Array[]): Float32Array {
  const out = new Float32Array(chunks.reduce((n, c) => n + c.length, 0))
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}

interface ListenerOptions {
  onFinal: (text: string, wav?: Blob) => void
  onSpeechStart?: () => void
}

/**
 * Listens to the microphone, detects when the guest starts and stops talking,
 * and sends each utterance to local Whisper for transcription.
 */
export function useWhisperListener({ onFinal, onSpeechStart }: ListenerOptions) {
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [level, setLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [micLabel, setMicLabel] = useState<string | null>(null)
  const handlers = useRef({ onFinal, onSpeechStart })
  const teardown = useRef<(() => void) | null>(null)
  const pending = useRef(0)

  useEffect(() => {
    handlers.current = { onFinal, onSpeechStart }
  }, [onFinal, onSpeechStart])

  const send = useCallback(async (wav: Blob) => {
    pending.current += 1
    setTranscribing(true)
    try {
      const res = await fetch('/api/transcribe', { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav })
      const data = (await res.json()) as { text?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? `Server error ${res.status}`)
      if (data.text) handlers.current.onFinal(data.text, wav)
      setError(null)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(userFacingSpeechError(msg))
    } finally {
      pending.current -= 1
      if (pending.current === 0) setTranscribing(false)
    }
  }, [])

  const start = useCallback(async () => {
    if (teardown.current) return
    setError(null)
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      })
    } catch (e) {
      const name = e instanceof DOMException ? e.name : ''
      setError(
        userFacingSpeechError(
          name === 'NotAllowedError' ? 'blocked' : name === 'NotFoundError' ? 'No microphone' : 'secure page',
        ),
      )
      return
    }

    const track = stream.getAudioTracks()[0]
    if (!track || track.readyState !== 'live') {
      stream.getTracks().forEach((t) => t.stop())
      setError(userFacingSpeechError('no live audio'))
      return
    }
    track.enabled = true
    setMicLabel(track.label || 'Microphone')

    const ctx = new AudioContext()
    if (ctx.state === 'suspended') await ctx.resume()
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }))
    await ctx.audioWorklet.addModule(url)
    URL.revokeObjectURL(url)
    const source = ctx.createMediaStreamSource(stream)
    const node = new AudioWorkletNode(ctx, 'aw-recorder')
    const mute = ctx.createGain()
    mute.gain.value = 0
    source.connect(node)
    node.connect(mute).connect(ctx.destination)

    const rate = ctx.sampleRate
    const frameLen = Math.round((rate * FRAME_MS) / 1000)
    let frame = new Float32Array(frameLen)
    let fill = 0
    const preroll: Float32Array[] = []
    const prerollFrames = PREROLL_MS / FRAME_MS
    let speech: Float32Array[] = []
    let inSpeech = false
    let loudRun = 0
    let silentMs = 0
    let noise = 0.005
    let meterTick = 0
    let heardSound = false
    const watchdog = window.setTimeout(() => {
      if (!heardSound) {
        setError(userFacingSpeechError(`No sound from “${track.label || 'this microphone'}”.`))
      }
    }, 4000)

    const finish = () => {
      const audio = concat(speech)
      speech = []
      inSpeech = false
      setSpeaking(false)
      if ((audio.length / rate) * 1000 >= MIN_SPEECH_MS) send(encodeWav(downsample(audio, rate), TARGET_RATE))
    }

    const onFrame = (f: Float32Array) => {
      let sum = 0
      for (let i = 0; i < f.length; i++) sum += f[i] * f[i]
      const rms = Math.sqrt(sum / f.length)
      if (rms > 0.008) heardSound = true
      const threshold = Math.max(0.012, noise * 3)
      const loud = rms > threshold
      if (!inSpeech) noise = noise * 0.98 + Math.min(rms, 0.05) * 0.02
      if (++meterTick % 3 === 0) setLevel(Math.min(1, rms / 0.15))

      if (!inSpeech) {
        preroll.push(f)
        if (preroll.length > prerollFrames) preroll.shift()
        loudRun = loud ? loudRun + 1 : 0
        if (loudRun >= START_FRAMES) {
          inSpeech = true
          silentMs = 0
          speech = preroll.splice(0)
          setSpeaking(true)
          handlers.current.onSpeechStart?.()
        }
        return
      }
      speech.push(f)
      silentMs = loud ? 0 : silentMs + FRAME_MS
      const duration = speech.length * FRAME_MS
      if (silentMs >= END_SILENCE_MS || duration >= MAX_SPEECH_MS) finish()
    }

    node.port.onmessage = (e: MessageEvent<Float32Array>) => {
      const chunk = e.data
      let i = 0
      while (i < chunk.length) {
        const n = Math.min(frameLen - fill, chunk.length - i)
        frame.set(chunk.subarray(i, i + n), fill)
        fill += n
        i += n
        if (fill === frameLen) {
          onFrame(frame)
          frame = new Float32Array(frameLen)
          fill = 0
        }
      }
    }

    teardown.current = () => {
      window.clearTimeout(watchdog)
      if (inSpeech) finish()
      node.port.onmessage = null
      source.disconnect()
      node.disconnect()
      stream.getTracks().forEach((t) => t.stop())
      ctx.close()
      setLevel(0)
      setMicLabel(null)
    }
    setListening(true)
  }, [send])

  const stop = useCallback(() => {
    teardown.current?.()
    teardown.current = null
    setListening(false)
    setSpeaking(false)
  }, [])

  useEffect(() => () => teardown.current?.(), [])

  return { listening, speaking, transcribing, level, error, micLabel, start, stop }
}

/** Create a voice note for a reply using the local TTS engine. Returns a playable URL, or null if unavailable. */
export async function makeVoiceNote(text: string): Promise<string | null> {
  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    if (!res.ok) return null
    return URL.createObjectURL(await res.blob())
  } catch {
    return null
  }
}

let current: HTMLAudioElement | null = null
let playId = 0

/** Play a voice note; falls back to the browser's built-in voice when no note exists. */
export function playVoice(url: string | null | undefined, text: string, done?: () => void) {
  const id = ++playId
  // Only the latest playback reports completion, so stopping an old one cannot clear the new state.
  const onEnd = () => {
    if (id === playId) done?.()
  }
  current?.pause()
  window.speechSynthesis?.cancel()
  if (url) {
    const audio = new Audio(url)
    current = audio
    audio.onended = () => onEnd?.()
    audio.onerror = () => onEnd?.()
    audio.play().catch(() => onEnd?.())
    return
  }
  if (!('speechSynthesis' in window)) {
    onEnd?.()
    return
  }
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'en-GB'
  u.rate = 0.95
  u.onend = () => onEnd?.()
  u.onerror = () => onEnd?.()
  // Some browsers have no voices and never fire `end`.
  window.setTimeout(() => onEnd?.(), 1500 + text.split(/\s+/).length * 450)
  window.speechSynthesis.speak(u)
}
