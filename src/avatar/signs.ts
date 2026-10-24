import type { Face, Gloss, HandPose, Keyframe, Pose, Shape } from './types'

/** Build a hand pose for the avatar's right (dominant) hand. */
const h = (x: number, y: number, rot = 0, shape: Shape = 'flat'): HandPose => ({ x, y, rot, shape })

/** Mirror a right-hand pose onto the avatar's left hand. */
const m = (p: HandPose): HandPose => ({ ...p, x: 300 - p.x, rot: -p.rot })

export const REST_R = h(90, 322, 172, 'flat')
export const REST_L = m(REST_R)
export const REST: Pose = { R: REST_R, L: REST_L, face: 'smile' }

/** Repeat a two-pose movement to make small oscillations (waves, taps, shakes). */
function oscillate(a: Keyframe, b: Keyframe, times: number): Keyframe[] {
  const out: Keyframe[] = [a]
  for (let i = 0; i < times; i++) out.push({ ...(i % 2 === 0 ? b : a), dur: 170 })
  return out
}

/**
 * Sign library.
 *
 * These motions are ILLUSTRATIVE placeholders that show how the avatar engine works.
 * Before real use, every entry must be replaced or checked by Deaf Kenyan Sign Language (KSL) signers.
 */
export const SIGNS: Record<string, Keyframe[]> = {
  HELLO: oscillate(
    { R: h(72, 118, -15, 'open'), dur: 380 },
    { R: h(66, 114, 15, 'open'), dur: 220 },
    3,
  ),
  WELCOME: [
    { R: h(138, 250, -80, 'flat'), L: m(h(138, 250, -80, 'flat')), dur: 360 },
    { R: h(72, 262, -105, 'flat'), L: m(h(72, 262, -105, 'flat')), dur: 420, hold: 120 },
  ],
  'THANK-YOU': [
    { R: h(140, 168, 8, 'flat'), dur: 380, hold: 80 },
    { R: h(104, 245, 60, 'flat'), dur: 420, hold: 100 },
  ],
  YES: oscillate({ R: h(118, 230, 0, 'fist'), dur: 300 }, { R: h(118, 248, 28, 'fist'), dur: 180 }, 3),
  NO: oscillate(
    { R: h(112, 205, -25, 'vee'), face: 'serious', dur: 300 },
    { R: h(112, 205, 20, 'vee'), dur: 180 },
    3,
  ),
  PLEASE: [
    { R: h(146, 248, -70, 'flat'), dur: 300 },
    { R: h(134, 262, -70, 'flat'), dur: 200 },
    { R: h(150, 274, -70, 'flat'), dur: 200 },
    { R: h(160, 256, -70, 'flat'), dur: 200 },
  ],
  RESERVATION: [
    { R: h(140, 240, 10, 'flat'), L: m(h(140, 240, 10, 'flat')), dur: 340 },
    { R: h(110, 250, -55, 'flat'), L: m(h(110, 250, -55, 'flat')), dur: 400, hold: 100 },
  ],
  'CHECK-IN': [
    { L: m(h(140, 258, -90, 'cup')), R: h(108, 212, 125, 'flat'), dur: 360 },
    { L: m(h(140, 258, -90, 'cup')), R: h(140, 252, 150, 'flat'), dur: 360, hold: 120 },
  ],
  'CHECK-OUT': [
    { L: m(h(140, 258, -90, 'cup')), R: h(140, 252, 150, 'flat'), dur: 360 },
    { L: m(h(140, 258, -90, 'cup')), R: h(108, 212, 125, 'flat'), dur: 360, hold: 120 },
  ],
  ROOM: [
    { R: h(116, 232, 0, 'flat'), L: m(h(116, 232, 0, 'flat')), dur: 320 },
    { R: h(128, 214, -90, 'flat'), L: m(h(128, 262, -90, 'flat')), dur: 360, hold: 100 },
  ],
  KEY: oscillate(
    { L: m(h(140, 256, 0, 'flat')), R: h(126, 252, -60, 'ok'), dur: 330 },
    { L: m(h(140, 256, 0, 'flat')), R: h(126, 252, 0, 'ok'), dur: 200 },
    2,
  ),
  NAME: oscillate(
    { R: h(128, 238, -70, 'vee'), L: m(h(128, 252, -60, 'vee')), dur: 330 },
    { R: h(131, 248, -70, 'vee'), L: m(h(128, 252, -60, 'vee')), dur: 160 },
    3,
  ),
  EAT: oscillate({ R: h(142, 154, -20, 'ok'), dur: 350 }, { R: h(130, 180, -20, 'ok'), dur: 180 }, 3),
  MORNING: [
    { L: m(h(150, 276, -90, 'flat')), R: h(110, 290, 30, 'flat'), dur: 340 },
    { L: m(h(150, 276, -90, 'flat')), R: h(110, 226, 0, 'flat'), dur: 420, hold: 80 },
  ],
  DRINK: [
    { R: h(138, 176, 0, 'cup'), dur: 330 },
    { R: h(142, 152, -35, 'cup'), dur: 350, hold: 120 },
  ],
  WHERE: oscillate(
    { R: h(108, 196, -15, 'point'), face: 'question', dur: 300 },
    { R: h(108, 196, 15, 'point'), dur: 200 },
    3,
  ),
  WHAT: oscillate(
    { R: h(104, 258, -110, 'open'), L: m(h(104, 258, -110, 'open')), face: 'question', dur: 320 },
    { R: h(96, 258, -120, 'open'), L: m(h(96, 258, -120, 'open')), dur: 180 },
    3,
  ),
  TIME: oscillate(
    { L: m(h(132, 264, -90, 'fist')), R: h(160, 236, 160, 'point'), dur: 320 },
    { L: m(h(132, 264, -90, 'fist')), R: h(160, 250, 160, 'point'), dur: 150 },
    3,
  ),
  LEFT: [
    { L: m(h(110, 235, -45, 'point')), dur: 300 },
    { L: m(h(46, 222, -90, 'point')), dur: 380, hold: 150 },
  ],
  RIGHT: [
    { R: h(110, 235, -45, 'point'), dur: 300 },
    { R: h(46, 222, -90, 'point'), dur: 380, hold: 150 },
  ],
  THERE: [
    { R: h(120, 240, -20, 'point'), dur: 300 },
    { R: h(68, 212, -60, 'point'), dur: 380, hold: 150 },
  ],
  UP: [
    { R: h(102, 222, 0, 'point'), dur: 300 },
    { R: h(94, 148, 0, 'point'), dur: 380, hold: 150 },
  ],
  DOWN: [
    { R: h(102, 230, 180, 'point'), dur: 300 },
    { R: h(96, 292, 180, 'point'), dur: 380, hold: 150 },
  ],
  WAIT: oscillate(
    { R: h(94, 236, -20, 'open'), L: m(h(94, 236, -20, 'open')), dur: 320 },
    { R: h(94, 236, -8, 'open'), L: m(h(94, 236, -8, 'open')), dur: 160 },
    4,
  ),
  HELP: [
    { L: m(h(140, 274, -90, 'flat')), R: h(140, 256, 0, 'thumb'), dur: 340 },
    { L: m(h(140, 248, -90, 'flat')), R: h(140, 230, 0, 'thumb'), dur: 380, hold: 100 },
  ],
  SORRY: [
    { R: h(146, 248, -10, 'fist'), face: 'sad', dur: 300 },
    { R: h(134, 262, -10, 'fist'), dur: 200 },
    { R: h(150, 274, -10, 'fist'), dur: 200 },
    { R: h(160, 256, -10, 'fist'), dur: 200 },
  ],
  GOOD: [
    { R: h(140, 168, 0, 'flat'), dur: 340 },
    { R: h(132, 252, -80, 'flat'), dur: 400, hold: 100 },
  ],
  OK: oscillate({ R: h(108, 212, 0, 'ok'), dur: 320 }, { R: h(108, 212, 12, 'ok'), dur: 160 }, 2),
  PAY: oscillate(
    { L: m(h(136, 270, -90, 'flat')), R: h(138, 238, 170, 'flat'), dur: 330 },
    { L: m(h(136, 270, -90, 'flat')), R: h(138, 256, 170, 'flat'), dur: 160 },
    3,
  ),
  BYE: [
    { R: h(90, 192, 0, 'open'), dur: 320 },
    { R: h(90, 192, 0, 'flat'), dur: 170 },
    { R: h(90, 192, 0, 'open'), dur: 170 },
    { R: h(90, 192, 0, 'flat'), dur: 170 },
    { R: h(90, 192, 0, 'open'), dur: 170 },
  ],
  YOU: [
    { R: h(128, 256, 0, 'point'), dur: 300 },
    { R: h(122, 242, 0, 'point'), dur: 220, hold: 120 },
  ],
  ME: [
    { R: h(132, 238, 0, 'point'), dur: 260 },
    { R: h(150, 246, 150, 'point'), dur: 260, hold: 120 },
  ],
  MY: [
    { R: h(132, 236, -40, 'flat'), dur: 260 },
    { R: h(150, 250, -75, 'flat'), dur: 260, hold: 120 },
  ],
  HAVE: [
    { R: h(116, 232, -100, 'flat'), L: m(h(116, 232, -100, 'flat')), dur: 300 },
    { R: h(142, 246, -130, 'flat'), L: m(h(142, 246, -130, 'flat')), dur: 300, hold: 100 },
  ],
  WANT: [
    { R: h(104, 262, -120, 'open'), L: m(h(104, 262, -120, 'open')), dur: 320 },
    { R: h(122, 246, -120, 'cup'), L: m(h(122, 246, -120, 'cup')), dur: 340, hold: 100 },
  ],
  CAN: [
    { R: h(116, 228, 0, 'fist'), L: m(h(116, 228, 0, 'fist')), dur: 300 },
    { R: h(116, 254, 0, 'fist'), L: m(h(116, 254, 0, 'fist')), dur: 240, hold: 100 },
  ],
  HOW: [
    { R: h(140, 246, -70, 'fist'), L: m(h(140, 246, -70, 'fist')), dur: 320 },
    { R: h(136, 240, 0, 'fist'), L: m(h(136, 240, 0, 'fist')), dur: 340, hold: 100 },
  ],
  TOILET: oscillate({ R: h(108, 212, -12, 'fist'), dur: 300 }, { R: h(108, 212, 12, 'fist'), dur: 160 }, 3),
  TAXI: oscillate(
    { R: h(116, 228, 0, 'fist'), L: m(h(116, 252, 0, 'fist')), dur: 320 },
    { R: h(116, 252, 0, 'fist'), L: m(h(116, 228, 0, 'fist')), dur: 260 },
    2,
  ),
  SWIM: [
    { R: h(140, 246, -90, 'flat'), L: m(h(140, 246, -90, 'flat')), dur: 320 },
    { R: h(96, 248, -150, 'flat'), L: m(h(96, 248, -150, 'flat')), dur: 380 },
    { R: h(140, 246, -90, 'flat'), L: m(h(140, 246, -90, 'flat')), dur: 380 },
  ],
  BAG: [
    { R: h(98, 302, 180, 'fist'), dur: 300 },
    { R: h(98, 284, 180, 'fist'), dur: 220 },
    { R: h(98, 302, 180, 'fist'), dur: 220 },
  ],
}

/** Whole receptionist lines signed as a planned sequence (demo library). Longer matches first. */
export const HOTEL_SIGN_LINES: Array<[string[], string[]]> = [
  [['welcome', 'how', 'can', 'i', 'help', 'you'], ['WELCOME', 'HELP', 'YOU']],
  [['good', 'morning', 'welcome', 'to', 'our', 'hotel'], ['GOOD', 'MORNING', 'WELCOME']],
  [['do', 'you', 'have', 'a', 'reservation'], ['YOU', 'HAVE', 'RESERVATION']],
  [['may', 'i', 'see', 'your', 'id', 'or', 'passport', 'please'], ['PLEASE', 'NAME']],
  [['your', 'room', 'is', 'ready'], ['YOU', 'ROOM', 'GOOD']],
  [['here', 'is', 'your', 'room', 'key'], ['KEY']],
  [['breakfast', 'is', 'served'], ['MORNING', 'EAT', 'TIME']],
  [['the', 'lift', 'is', 'on', 'your', 'left'], ['UP', 'LEFT']],
  [['check', 'out', 'is', 'at'], ['TIME', 'CHECK-OUT']],
  [['enjoy', 'your', 'stay'], ['GOOD', 'BYE']],
]

/** Words and phrases mapped to one or more glosses. Multi-word phrases are matched first. */
const PHRASES: Array<[string[], string[]]> = [
  ...HOTEL_SIGN_LINES,
  [['thank', 'you'], ['THANK-YOU']],
  [['check', 'out'], ['CHECK-OUT']],
  [['check', 'in'], ['CHECK-IN']],
  [['good', 'morning'], ['GOOD', 'MORNING']],
  [['how', 'much'], ['HOW', 'PAY']],
  [['excuse', 'me'], ['SORRY']],
  [['wi', 'fi'], ['W', 'I', 'F', 'I']],
]

const WORDS: Record<string, string[]> = {
  hello: ['HELLO'], hi: ['HELLO'], hey: ['HELLO'], jambo: ['HELLO'], habari: ['HELLO'],
  welcome: ['WELCOME'], karibu: ['WELCOME'],
  thanks: ['THANK-YOU'], asante: ['THANK-YOU'], checkin: ['CHECK-IN'],
  yes: ['YES'], yeah: ['YES'], yep: ['YES'], sure: ['YES'], ndio: ['YES'],
  no: ['NO'], not: ['NO'], dont: ['NO'], nope: ['NO'], hapana: ['NO'],
  please: ['PLEASE'], tafadhali: ['PLEASE'],
  reservation: ['RESERVATION'], reserved: ['RESERVATION'], booking: ['RESERVATION'],
  booked: ['RESERVATION'], book: ['RESERVATION'],
  room: ['ROOM'], rooms: ['ROOM'],
  key: ['KEY'], keys: ['KEY'],
  name: ['NAME'],
  breakfast: ['MORNING', 'EAT'], eat: ['EAT'], food: ['EAT'], lunch: ['EAT'], dinner: ['EAT'],
  restaurant: ['EAT'], hungry: ['EAT'], morning: ['MORNING'],
  water: ['DRINK'], drink: ['DRINK'], coffee: ['DRINK'], tea: ['DRINK'], juice: ['DRINK'],
  where: ['WHERE'], what: ['WHAT'], when: ['WHAT', 'TIME'], time: ['TIME'],
  left: ['LEFT'], right: ['RIGHT'],
  there: ['THERE'], directions: ['THERE'], direction: ['THERE'], go: ['THERE'], way: ['THERE'],
  up: ['UP'], upstairs: ['UP'], floor: ['UP'], lift: ['UP'], elevator: ['UP'],
  down: ['DOWN'], downstairs: ['DOWN'],
  wait: ['WAIT'], moment: ['WAIT'],
  help: ['HELP'], assist: ['HELP'],
  sorry: ['SORRY'],
  good: ['GOOD'], great: ['GOOD'], fine: ['GOOD'], nice: ['GOOD'],
  ok: ['OK'], okay: ['OK'],
  pay: ['PAY'], money: ['PAY'], price: ['PAY'], cost: ['PAY'], payment: ['PAY'], bill: ['PAY'],
  bye: ['BYE'], goodbye: ['BYE'], kwaheri: ['BYE'],
  you: ['YOU'], your: ['YOU'],
  i: ['ME'], me: ['ME'], im: ['ME'],
  my: ['MY'], mine: ['MY'],
  have: ['HAVE'], has: ['HAVE'], got: ['HAVE'],
  need: ['WANT'], want: ['WANT'], like: ['WANT'],
  can: ['CAN'], could: ['CAN'],
  how: ['HOW'],
  toilet: ['TOILET'], bathroom: ['TOILET'], restroom: ['TOILET'], washroom: ['TOILET'],
  taxi: ['TAXI'], car: ['TAXI'], cab: ['TAXI'], uber: ['TAXI'],
  pool: ['SWIM'], swim: ['SWIM'], swimming: ['SWIM'],
  bag: ['BAG'], bags: ['BAG'], luggage: ['BAG'], suitcase: ['BAG'],
}

/** Words that sign languages usually leave out of a signed sentence. */
const SKIP = new Set([
  'a', 'an', 'the', 'is', 'are', 'am', 'was', 'were', 'be', 'to', 'of', 'do', 'does', 'did', 'at',
  'in', 'on', 'for', 'under', 'with', 'and', 'it', 'its', 'this', 'that', 'will', 'would', 'should',
  'just', 'so', 'um', 'uh', 'er', 'some', 'any', 'there\'s', 'from', 'by', 'as', 'or', 'also',
])

const SPELL_SHAPES: Shape[] = ['fist', 'point', 'vee', 'flat', 'open', 'ok', 'thumb', 'cup']

/** Fingerspell a word letter by letter (handshapes are placeholders, the letter is shown in a bubble). */
function fingerspell(word: string): Gloss {
  const letters = word.toUpperCase().replace(/[^A-Z0-9]/g, '').split('')
  const frames: Keyframe[] = letters.map((letter, i) => {
    const code = letter.charCodeAt(0)
    return {
      R: h(90 + (i % 2), 206, ((code * 37) % 30) - 15, SPELL_SHAPES[code % SPELL_SHAPES.length]),
      dur: i === 0 ? 300 : 200,
      hold: 140,
      letter,
    }
  })
  return { label: letters.join('-'), frames, spelled: true }
}

function sign(key: string): Gloss {
  if (SIGNS[key]) return { label: key, frames: SIGNS[key], spelled: false }
  return fingerspell(key)
}

function containsSeq(tokens: string[], words: string[]) {
  for (let i = 0; i <= tokens.length - words.length; i++) {
    if (words.every((w, j) => tokens[i + j] === w)) return true
  }
  return false
}

function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/-/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

/** Convert an English sentence into a sequence of glosses the avatar can perform. */
export function textToGloss(text: string): Gloss[] {
  const tokens = tokenize(text)
  const hotel = HOTEL_SIGN_LINES.find(([words]) => containsSeq(tokens, words))
  if (hotel) return hotel[1].map((g) => sign(g))

  const out: Gloss[] = []
  for (let i = 0; i < tokens.length; i++) {
    const phrase = PHRASES.find(([words]) => words.every((w, j) => tokens[i + j] === w))
    if (phrase) {
      const [words, glosses] = phrase
      if (glosses.every((g) => g.length === 1)) out.push(fingerspell(glosses.join('')))
      else glosses.forEach((g) => out.push(sign(g)))
      i += words.length - 1
      continue
    }
    const word = tokens[i]
    if (SKIP.has(word)) continue
    const mapped = WORDS[word]
    if (mapped) mapped.forEach((g) => out.push(sign(g)))
    else out.push(fingerspell(word))
  }
  return out
}

export interface Segment {
  pose: Pose
  dur: number
  hold: number
  gloss: number
  letter: string | null
}

/** Flatten glosses into timed poses. Hands not given in a keyframe keep their previous pose within the sign. */
export function toSegments(glosses: Gloss[]): Segment[] {
  const segs: Segment[] = []
  glosses.forEach((g, gi) => {
    let R = REST_R
    let L = REST_L
    let face: Face = 'smile'
    g.frames.forEach((kf, ki) => {
      if (ki === 0) {
        R = kf.R ?? REST_R
        L = kf.L ?? REST_L
        face = kf.face ?? 'smile'
      } else {
        R = kf.R ?? R
        L = kf.L ?? L
        face = kf.face ?? face
      }
      segs.push({ pose: { R, L, face }, dur: kf.dur, hold: kf.hold ?? 40, gloss: gi, letter: kf.letter ?? null })
    })
  })
  return segs
}
