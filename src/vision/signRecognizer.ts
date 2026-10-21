import { FilesetResolver, HandLandmarker, type HandLandmarkerResult } from '@mediapipe/tasks-vision'

let landmarker: Promise<HandLandmarker> | null = null

/** Load MediaPipe's hand tracker once. Files are served from /public so it works offline. */
export function getHandLandmarker(): Promise<HandLandmarker> {
  landmarker ??= (async () => {
    const files = await FilesetResolver.forVisionTasks('/mediapipe/wasm')
    const options = (delegate: 'GPU' | 'CPU') => ({
      baseOptions: { modelAssetPath: '/mediapipe/hand_landmarker.task', delegate },
      runningMode: 'VIDEO' as const,
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    })
    try {
      return await HandLandmarker.createFromOptions(files, options('GPU'))
    } catch {
      return HandLandmarker.createFromOptions(files, options('CPU'))
    }
  })()
  return landmarker
}

export type Features = number[]
export type Sequence = Features[]

const PER_HAND = 45
const SEQ_LEN = 24

/**
 * Turn one video frame of hand landmarks into a feature vector.
 * Each hand: 20 landmark offsets from the wrist (scaled by hand size), wrist position in the frame, and presence.
 */
export function toFeatures(result: HandLandmarkerResult): Features {
  const slots: Features[] = [new Array(PER_HAND).fill(0), new Array(PER_HAND).fill(0)]
  const hands = result.landmarks.map((lm, i) => ({ lm, label: result.handedness[i]?.[0]?.categoryName ?? 'Right' }))
  if (hands.length === 2 && hands[0].label === hands[1].label) {
    hands.sort((a, b) => a.lm[0].x - b.lm[0].x)
    hands[0].label = 'Right'
    hands[1].label = 'Left'
  }
  for (const { lm, label } of hands) {
    const slot = label === 'Left' ? 1 : 0
    const wrist = lm[0]
    const scale = Math.hypot(lm[9].x - wrist.x, lm[9].y - wrist.y) || 1e-3
    const f: number[] = []
    for (let i = 1; i < 21; i++) f.push((lm[i].x - wrist.x) / scale, (lm[i].y - wrist.y) / scale)
    f.push((wrist.x - 0.5) * 6, (wrist.y - 0.5) * 6, 2)
    slots[slot] = f
  }
  return [...slots[0], ...slots[1]]
}

export const hasHands = (result: HandLandmarkerResult) => result.landmarks.length > 0

/** Resample a sequence to a fixed number of frames so signs of different speeds compare fairly. */
function resample(seq: Sequence, n = SEQ_LEN): Sequence {
  if (seq.length === 0) return []
  const out: Sequence = []
  for (let i = 0; i < n; i++) {
    const pos = (i * (seq.length - 1)) / Math.max(1, n - 1)
    const a = Math.floor(pos)
    const b = Math.min(seq.length - 1, a + 1)
    const t = pos - a
    out.push(seq[a].map((x, k) => +(x + (seq[b][k] - x) * t).toFixed(3)))
  }
  return out
}

function frameDist(a: Features, b: Features) {
  let s = 0
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i]
    s += d * d
  }
  return Math.sqrt(s)
}

/** Dynamic time warping distance with a band, normalised by path length. */
function dtw(a: Sequence, b: Sequence, band = 6): number {
  const n = a.length
  const m = b.length
  const D = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(Infinity))
  D[0][0] = 0
  for (let i = 1; i <= n; i++) {
    for (let j = Math.max(1, i - band); j <= Math.min(m, i + band); j++) {
      D[i][j] = frameDist(a[i - 1], b[j - 1]) + Math.min(D[i - 1][j], D[i][j - 1], D[i - 1][j - 1])
    }
  }
  return D[n][m] / (n + m)
}

export interface SignTemplate {
  phrase: string
  samples: Sequence[]
}

export interface Match {
  phrase: string
  distance: number
}

const STORAGE_KEY = 'accesswork-sign-templates-v1'

export function loadTemplates(): SignTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SignTemplate[]) : []
  } catch {
    return []
  }
}

export function saveTemplates(templates: SignTemplate[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates))
}

/** Normalise a recorded clip: drop frames without hands at the ends, then resample. */
export function prepareSequence(frames: Array<{ f: Features; hands: boolean }>): Sequence | null {
  let start = 0
  let end = frames.length - 1
  while (start <= end && !frames[start].hands) start++
  while (end >= start && !frames[end].hands) end--
  const kept = frames.slice(start, end + 1).map((x) => x.f)
  return kept.length >= 6 ? resample(kept) : null
}

/** Rank trained phrases by how closely the clip matches their best sample. */
export function classify(seq: Sequence, templates: SignTemplate[]): Match[] {
  return templates
    .filter((t) => t.samples.length > 0)
    .map((t) => ({ phrase: t.phrase, distance: Math.min(...t.samples.map((s) => dtw(seq, s))) }))
    .sort((a, b) => a.distance - b.distance)
}

/** Rough confidence from how much better the best match is than the runner-up. */
export function confidence(matches: Match[]): 'high' | 'medium' | 'low' {
  if (matches.length === 0) return 'low'
  if (matches.length === 1) return matches[0].distance < 1.2 ? 'medium' : 'low'
  const ratio = matches[0].distance / matches[1].distance
  if (ratio < 0.65) return 'high'
  if (ratio < 0.85) return 'medium'
  return 'low'
}

/**
 * Splits a live stream of frames into individual signs:
 * a sign starts when hands appear and ends when they leave the frame (or after a time limit).
 */
export class SignSegmenter {
  private frames: Array<{ f: Features; hands: boolean }> = []
  private active = false
  private seenRun = 0
  private missingRun = 0
  private readonly startFrames = 4
  private readonly endFrames = 10
  private readonly maxFrames = 180

  get signing() {
    return this.active
  }

  reset() {
    this.frames = []
    this.active = false
    this.seenRun = 0
    this.missingRun = 0
  }

  /** Returns a finished clip when a sign has ended, otherwise null. */
  push(f: Features, hands: boolean): Sequence | null {
    if (!this.active) {
      this.seenRun = hands ? this.seenRun + 1 : 0
      if (this.seenRun >= this.startFrames) {
        this.active = true
        this.missingRun = 0
        this.frames = []
      }
      if (!this.active) return null
    }
    this.frames.push({ f, hands })
    this.missingRun = hands ? 0 : this.missingRun + 1
    if (this.missingRun >= this.endFrames || this.frames.length >= this.maxFrames) {
      const clip = prepareSequence(this.frames)
      this.reset()
      return clip
    }
    return null
  }
}
