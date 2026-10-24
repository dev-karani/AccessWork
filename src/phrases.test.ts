import { describe, expect, it } from 'vitest'
import { PHRASE_GROUPS, SAMPLE_GUEST_LINES } from './phrases'

describe('hospitality phrases', () => {
  it('keeps grouped quick replies', () => {
    expect(PHRASE_GROUPS.map((g) => g.id)).toEqual(['top10', 'greet', 'checkin', 'food', 'directions', 'payment', 'general'])
    expect(PHRASE_GROUPS.every((g) => g.phrases.length > 0)).toBe(true)
  })

  it('keeps demo guest lines', () => {
    expect(SAMPLE_GUEST_LINES.length).toBeGreaterThan(2)
  })
})
