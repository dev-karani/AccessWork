import { useCallback, useEffect, useRef, useState } from 'react'
import { REST, textToGloss, toSegments, type Segment } from './signs'
import type { Gloss, HandPose, Pose } from './types'

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

function lerpHand(a: HandPose, b: HandPose, t: number): HandPose {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    rot: lerp(a.rot, b.rot, t),
    shape: t < 0.5 ? a.shape : b.shape,
  }
}

function lerpPose(a: Pose, b: Pose, t: number): Pose {
  return { R: lerpHand(a.R, b.R, t), L: lerpHand(a.L, b.L, t), face: t < 0.3 ? a.face : b.face }
}

export interface SignerState {
  glosses: Gloss[]
  active: number
  letter: string | null
  playing: boolean
}

/** Drives the avatar: turns text into glosses and animates poses with requestAnimationFrame. */
export function useSigner() {
  const [pose, setPose] = useState<Pose>(REST)
  const [state, setState] = useState<SignerState>({ glosses: [], active: -1, letter: null, playing: false })
  const [speed, setSpeed] = useState(1)
  const speedRef = useRef(1)
  const current = useRef<Pose>(REST)
  const frame = useRef<number | null>(null)

  useEffect(() => {
    speedRef.current = speed
  }, [speed])

  const cancel = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
  }

  const run = useCallback((segs: Segment[], glosses: Gloss[]) => {
    cancel()
    if (!segs.length) {
      setState({ glosses, active: -1, letter: null, playing: false })
      return
    }
    let i = 0
    let from = current.current
    let start = performance.now()
    setState({ glosses, active: segs[0].gloss, letter: segs[0].letter, playing: true })

    const tick = (now: number) => {
      const seg = segs[i]
      const dur = seg.dur / speedRef.current
      const hold = seg.hold / speedRef.current
      const t = now - start
      const next = lerpPose(from, seg.pose, ease(Math.min(1, t / dur)))
      current.current = next
      setPose(next)

      if (t >= dur + hold) {
        from = seg.pose
        i += 1
        start = now
        if (i >= segs.length) {
          frame.current = null
          setState((s) => ({ ...s, active: -1, letter: null, playing: false }))
          return
        }
        const nx = segs[i]
        if (nx.gloss !== seg.gloss || nx.letter !== seg.letter) {
          setState((s) => ({ ...s, active: nx.gloss, letter: nx.letter }))
        }
      }
      frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
  }, [])

  const play = useCallback(
    (text: string) => {
      const glosses = textToGloss(text)
      run(toSegments(glosses), glosses)
    },
    [run],
  )

  const stop = useCallback(() => {
    run([{ pose: REST, dur: 400, hold: 0, gloss: -1, letter: null }], [])
  }, [run])

  useEffect(() => cancel, [])

  return { pose, ...state, play, stop, speed, setSpeed }
}
