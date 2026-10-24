import { describe, expect, it } from 'vitest'
import { signingAvailability, signingStageCopy, tokenKind, tokenKindLabel } from './signingAvailability'
import { textToGloss } from './signs'

describe('signingAvailability', () => {
  it('never claims verified Kenyan Sign Language', () => {
    const hello = signingAvailability('Hello, I have a reservation')
    expect(hello.verifiedKsl).toBe(false)
    expect(hello.kind).not.toBe('verified-ksl')
  })

  it('marks empty text as unavailable', () => {
    expect(signingAvailability('   ').kind).toBe('unavailable')
    expect(signingAvailability('   ').demoAvailable).toBe(false)
  })

  it('offers signing when the word list matches', () => {
    const result = signingAvailability('hello')
    expect(result.demoAvailable).toBe(true)
    expect(result.glosses.some((g) => g.label === 'HELLO')).toBe(true)
  })

  it('signs a top hotel receptionist line as a planned sequence', () => {
    const result = signingAvailability('Welcome! How can I help you?')
    expect(result.demoAvailable).toBe(true)
    expect(result.glosses.map((g) => g.label)).toEqual(['WELCOME', 'HELP', 'YOU'])
  })

  it('labels known words as demo signs and unknown words as fingerspelling', () => {
    const glosses = textToGloss('hello xyzzy')
    expect(tokenKindLabel(tokenKind(glosses[0]))).toBe('Demo sign')
    expect(tokenKindLabel(tokenKind(glosses[1]))).toBe('Fingerspell')
    expect(glosses[1].spelled).toBe(true)
  })

  it('exposes ready, processing, signing, replay, unsupported, and error states', () => {
    expect(signingStageCopy('', false)).toEqual({ status: 'Ready', caption: '' })
    expect(signingStageCopy('hello', { playing: false, processing: true })).toEqual({
      status: 'Processing',
      caption: 'hello',
    })
    expect(signingStageCopy('Welcome! How can I help you?', true)).toEqual({
      status: 'Signing',
      caption: 'Welcome! How can I help you?',
    })
    expect(signingStageCopy('hello', { playing: true, replaying: true })).toEqual({
      status: 'Replay',
      caption: 'hello',
    })
    expect(signingStageCopy('!!!', false)).toEqual({ status: 'Unsupported', caption: '!!!' })
    expect(signingStageCopy('hello', { playing: false, error: true })).toEqual({
      status: 'Error',
      caption: 'hello',
    })
    expect(signingStageCopy('hello', false)).toEqual({ status: 'Ready', caption: 'hello' })
  })
})
