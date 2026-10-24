import type { Gloss } from './types'
import { textToGloss } from './signs'

export type SigningKind = 'verified-ksl' | 'placeholder' | 'unavailable'
export type TokenKind = 'demo-sign' | 'fingerspell'
export type StageStatus = 'Ready' | 'Processing' | 'Signing' | 'Replay' | 'Unsupported' | 'Error'

export interface SigningAvailability {
  kind: SigningKind
  glosses: Gloss[]
  /** No verified Kenyan Sign Language content exists in this build. */
  verifiedKsl: false
  demoAvailable: boolean
}

export interface StageView {
  status: StageStatus
  caption: string
}

export interface StageOptions {
  playing: boolean
  replaying?: boolean
  processing?: boolean
  error?: boolean
}

export function tokenKind(gloss: Gloss): TokenKind {
  return gloss.spelled ? 'fingerspell' : 'demo-sign'
}

export function tokenKindLabel(kind: TokenKind): string {
  return kind === 'fingerspell' ? 'Fingerspell' : 'Demo sign'
}

/**
 * Honest status for the signing stage.
 * Placeholder motions exist for the demo, but they are not checked KSL.
 */
export function signingStageCopy(text: string, playingOrOpts: boolean | StageOptions): StageView {
  const opts: StageOptions = typeof playingOrOpts === 'boolean' ? { playing: playingOrOpts } : playingOrOpts
  const clean = text.trim()
  const avail = signingAvailability(clean)
  if (opts.error) return { status: 'Error', caption: clean }
  if (opts.processing) return { status: 'Processing', caption: clean }
  if (opts.playing && opts.replaying) return { status: 'Replay', caption: clean }
  if (opts.playing) return { status: 'Signing', caption: clean }
  if (!clean) return { status: 'Ready', caption: '' }
  if (!avail.demoAvailable) return { status: 'Unsupported', caption: clean }
  return { status: 'Ready', caption: clean }
}

export function signingAvailability(text: string): SigningAvailability {
  const glosses = text.trim() ? textToGloss(text) : []
  return {
    kind: glosses.length ? 'placeholder' : 'unavailable',
    glosses,
    verifiedKsl: false,
    demoAvailable: glosses.length > 0,
  }
}
