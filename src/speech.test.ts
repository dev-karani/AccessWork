import { describe, expect, it } from 'vitest'
import { userFacingSpeechError } from './speech'

describe('userFacingSpeechError', () => {
  it('hides hardware chipset names from guests', () => {
    const raw = 'No sound from “400 Series Chipset Family HD Audio Digital Microphone”. Check the system input.'
    expect(userFacingSpeechError(raw)).toBe(
      "Microphone isn't receiving audio. Check the connection or choose another input. You can keep typing.",
    )
    expect(userFacingSpeechError(raw)).not.toMatch(/Chipset|400 Series/)
  })

  it('covers blocked, missing, and offline speech so typing stays available', () => {
    expect(userFacingSpeechError('Microphone access was blocked.')).toMatch(/type instead/i)
    expect(userFacingSpeechError('No microphone was found')).toMatch(/type instead/i)
    expect(userFacingSpeechError('Failed to fetch')).toBe('Speech is offline. You can keep typing.')
    expect(userFacingSpeechError('The local speech server is not running. Start it with: npm run server')).toBe(
      'Speech is offline. You can keep typing.',
    )
    expect(userFacingSpeechError('no live audio')).toMatch(/isn't receiving audio/)
    expect(userFacingSpeechError('AudioContext: default - Built-in Audio Analog Stereo')).not.toMatch(
      /AudioContext|Analog Stereo/,
    )
  })
})
