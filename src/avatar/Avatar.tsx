import { useEffect, useState, type ReactElement } from 'react'
import type { Face, HandPose, Pose, Shape } from './types'

const SKIN = '#9a5b34'
const SKIN_DARK = '#5e321a'
const HAIR = '#26160d'
const UNIFORM = '#0f6b63'
const UNIFORM_DARK = '#0a4a44'

const SHOULDER_R = { x: 100, y: 207 }
const SHOULDER_L = { x: 200, y: 207 }
const UPPER = 62
const FORE = 56

/** Two-bone inverse kinematics: find the elbow so the wrist lands on the target, bending outward. */
function solveArm(sx: number, sy: number, tx: number, ty: number, outward: 1 | -1) {
  let dx = tx - sx
  let dy = ty - sy
  const dist = Math.hypot(dx, dy) || 1
  const d = Math.min(UPPER + FORE - 0.5, Math.max(Math.abs(UPPER - FORE) + 1, dist))
  dx = (dx / dist) * d
  dy = (dy / dist) * d
  const base = Math.atan2(dy, dx)
  const a = Math.acos(Math.min(1, Math.max(-1, (UPPER ** 2 + d ** 2 - FORE ** 2) / (2 * UPPER * d))))
  const options = [base + a, base - a].map((ang) => ({
    ex: sx + UPPER * Math.cos(ang),
    ey: sy + UPPER * Math.sin(ang),
  }))
  const score = (o: { ex: number; ey: number }) => (o.ex - sx) * outward + 0.5 * (o.ey - sy)
  const elbow = score(options[0]) >= score(options[1]) ? options[0] : options[1]
  return { ...elbow, hx: sx + dx, hy: sy + dy }
}

const S = { fill: SKIN, stroke: SKIN_DARK, strokeWidth: 2 } as const

const finger = (x: number, len: number, rot: number, w = 6) => (
  <g key={`f${x}`} transform={`translate(${x} -20) rotate(${rot})`}>
    <rect x={-w / 2} y={-len} width={w} height={len + 4} rx={w / 2} {...S} />
  </g>
)
const thumb = (rot: number, len = 14, ty = -8) => (
  <g transform={`translate(10 ${ty}) rotate(${rot})`}>
    <rect x={-3.5} y={-len} width={7} height={len + 3} rx={3.5} {...S} />
  </g>
)
const palm = <rect x={-12} y={-25} width={24} height={27} rx={9} {...S} />
const knuckles = (xs: number[]) =>
  xs.map((x) => <circle key={`k${x}`} cx={x} cy={-24} r={3.6} {...S} />)

/** Handshapes drawn at the wrist (origin) with fingers pointing up. Thumb sits on the +x side. */
const HANDS: Record<Shape, ReactElement> = {
  open: (
    <>
      {finger(8, 22, 10)}
      {finger(2.7, 25, 3)}
      {finger(-2.7, 23, -4)}
      {finger(-8, 18, -12)}
      {palm}
      {thumb(58)}
    </>
  ),
  flat: (
    <>
      {finger(8, 20, 0, 5.6)}
      {finger(2.7, 23, 0, 5.6)}
      {finger(-2.7, 21, 0, 5.6)}
      {finger(-8, 17, 0, 5.6)}
      {palm}
      {thumb(14, 12)}
    </>
  ),
  fist: (
    <>
      {palm}
      {knuckles([-8, -2.7, 2.7, 8])}
      {thumb(-70, 13, -12)}
    </>
  ),
  point: (
    <>
      {finger(7, 25, -2)}
      {palm}
      {knuckles([-8, -2.7, 2.7])}
      {thumb(-70, 12, -12)}
    </>
  ),
  vee: (
    <>
      {finger(7, 23, 12)}
      {finger(1.5, 24, -8)}
      {palm}
      {knuckles([-8, -3])}
      {thumb(-70, 12, -12)}
    </>
  ),
  thumb: (
    <>
      {palm}
      {knuckles([-8, -2.7, 2.7, 8])}
      {thumb(0, 17, -14)}
    </>
  ),
  ok: (
    <>
      {finger(2.7, 23, 3)}
      {finger(-2.7, 21, -4)}
      {finger(-8, 17, -12)}
      {palm}
      <circle cx={10} cy={-27} r={6.5} fill="none" stroke={SKIN_DARK} strokeWidth={7.5} />
      <circle cx={10} cy={-27} r={6.5} fill="none" stroke={SKIN} strokeWidth={4.5} />
    </>
  ),
  cup: (
    <>
      <path d="M 9 -22 C 16 -44, -12 -48, -11 -28" fill="none" stroke={SKIN_DARK} strokeWidth={13} strokeLinecap="round" />
      <path d="M 9 -22 C 16 -44, -12 -48, -11 -28" fill="none" stroke={SKIN} strokeWidth={9} strokeLinecap="round" />
      {palm}
      {thumb(75, 12, -6)}
    </>
  ),
}

function Arm({ hand, shoulder, outward }: { hand: HandPose; shoulder: { x: number; y: number }; outward: 1 | -1 }) {
  const { ex, ey, hx, hy } = solveArm(shoulder.x, shoulder.y, hand.x, hand.y, outward)
  const pts = `${shoulder.x},${shoulder.y} ${ex},${ey} ${hx},${hy}`
  const mirror = outward === 1 ? ' scale(-1 1)' : ''
  return (
    <g>
      <polyline points={pts} fill="none" stroke={UNIFORM_DARK} strokeWidth={22} strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={pts} fill="none" stroke={UNIFORM} strokeWidth={17} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={hx} cy={hy} r={8.5} fill="#f4f1ea" stroke={UNIFORM_DARK} strokeWidth={2} />
      <g transform={`translate(${hx} ${hy}) rotate(${hand.rot})${mirror} scale(1.08)`}>{HANDS[hand.shape]}</g>
    </g>
  )
}

const BROWS: Record<Face, [string, string]> = {
  smile: ['M 114 84 Q 127 77 140 83', 'M 160 83 Q 173 77 186 84'],
  question: ['M 114 76 Q 127 66 140 74', 'M 160 74 Q 173 66 186 76'],
  sad: ['M 114 86 Q 127 83 140 77', 'M 160 77 Q 173 83 186 86'],
  serious: ['M 114 83 L 140 87', 'M 160 87 L 186 83'],
}

function Mouth({ face, talking, t }: { face: Face; talking: boolean; t: number }) {
  if (talking) {
    const open = 3 + 4.5 * Math.abs(Math.sin(t / 95))
    return (
      <g>
        <ellipse cx={150} cy={143} rx={10} ry={open} fill="#5b1616" />
        <ellipse cx={150} cy={143 + open * 0.45} rx={6} ry={open * 0.4} fill="#d9616a" />
      </g>
    )
  }
  switch (face) {
    case 'sad':
      return <path d="M 137 147 Q 150 137 163 147" fill="none" stroke="#5b1616" strokeWidth={3.5} strokeLinecap="round" />
    case 'question':
      return <ellipse cx={150} cy={143} rx={6} ry={7} fill="#5b1616" />
    case 'serious':
      return <path d="M 138 143 L 162 143" stroke="#5b1616" strokeWidth={3.5} strokeLinecap="round" />
    default:
      return (
        <path d="M 134 137 Q 150 155 166 137 Q 150 146 134 137 Z" fill="#5b1616" stroke="#5b1616" strokeWidth={2.5} strokeLinejoin="round" />
      )
  }
}

interface AvatarProps {
  pose: Pose
  talking: boolean
  letter: string | null
}

/**
 * "Zuri", an original cartoon hotel receptionist who signs messages to the Deaf employee.
 * The SVG body is fixed; the arms are solved each frame from the hand targets in `pose`.
 */
export function Avatar({ pose, talking, letter }: AvatarProps) {
  const [t, setT] = useState(0)
  useEffect(() => {
    let id = 0
    const loop = (now: number) => {
      setT(now)
      id = requestAnimationFrame(loop)
    }
    id = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(id)
  }, [])

  const breath = Math.sin(t / 900) * 1.4
  const blinking = t % 4300 < 140
  const look = talking ? 0 : Math.sin(t / 2600) * 1.5

  return (
    <svg viewBox="0 0 300 380" className="avatar-svg" role="img" aria-label="Zuri, the signing avatar">
      <g transform={`translate(0 ${breath})`}>
        {/* Hair puffs behind the head */}
        <circle cx={104} cy={50} r={32} fill={HAIR} />
        <circle cx={196} cy={50} r={32} fill={HAIR} />
        <circle cx={104} cy={50} r={32} fill="url(#puff)" />
        <circle cx={196} cy={50} r={32} fill="url(#puff)" />

        {/* Body */}
        <rect x={136} y={158} width={28} height={48} fill={SKIN} stroke={SKIN_DARK} strokeWidth={2} />
        <path d="M 58 380 L 68 242 Q 74 204 112 198 L 188 198 Q 226 204 232 242 L 242 380 Z" fill={UNIFORM} stroke={UNIFORM_DARK} strokeWidth={3} />
        <path d="M 126 198 L 150 240 L 174 198 Z" fill="#f4f1ea" stroke="#cfc8b8" strokeWidth={2} />
        <path d="M 150 240 L 150 380" stroke={UNIFORM_DARK} strokeWidth={2} />
        <circle cx={150} cy={262} r={3} fill="#e8b84a" />
        <circle cx={150} cy={292} r={3} fill="#e8b84a" />
        <path d="M 134 204 L 150 212 L 166 204 L 166 220 L 150 212 L 134 220 Z" fill="#c2412d" stroke="#8a2a1c" strokeWidth={1.5} strokeLinejoin="round" />
        <rect x={174} y={252} width={38} height={16} rx={3} fill="#f4f1ea" stroke="#e8b84a" strokeWidth={2} />
        <text x={193} y={264} textAnchor="middle" fontSize={10} fontWeight={700} fill={UNIFORM_DARK} fontFamily="system-ui, sans-serif">
          ZURI
        </text>

        {/* Head */}
        <circle cx={88} cy={112} r={12} fill={SKIN} stroke={SKIN_DARK} strokeWidth={2} />
        <circle cx={212} cy={112} r={12} fill={SKIN} stroke={SKIN_DARK} strokeWidth={2} />
        <circle cx={212} cy={126} r={3.5} fill="#e8b84a" />
        <circle cx={88} cy={126} r={3.5} fill="#e8b84a" />
        <circle cx={150} cy={108} r={62} fill={SKIN} stroke={SKIN_DARK} strokeWidth={2.5} />
        <path d="M 88 104 Q 88 44 150 42 Q 212 44 212 104 Q 200 70 150 68 Q 100 70 88 104 Z" fill={HAIR} />
        <ellipse cx={114} cy={128} rx={10} ry={6} fill="#e0707a" opacity={0.35} />
        <ellipse cx={186} cy={128} rx={10} ry={6} fill="#e0707a" opacity={0.35} />

        {/* Eyes */}
        <g transform={`translate(0 105) scale(1 ${blinking ? 0.1 : 1}) translate(0 -105)`}>
          <ellipse cx={127} cy={105} rx={12.5} ry={15} fill="#fff" stroke={SKIN_DARK} strokeWidth={1.5} />
          <ellipse cx={173} cy={105} rx={12.5} ry={15} fill="#fff" stroke={SKIN_DARK} strokeWidth={1.5} />
          <circle cx={128 + look} cy={108} r={7.5} fill="#2a1a10" />
          <circle cx={174 + look} cy={108} r={7.5} fill="#2a1a10" />
          <circle cx={131 + look} cy={104.5} r={2.6} fill="#fff" />
          <circle cx={177 + look} cy={104.5} r={2.6} fill="#fff" />
        </g>
        {BROWS[pose.face].map((d) => (
          <path key={d} d={d} fill="none" stroke={HAIR} strokeWidth={4.5} strokeLinecap="round" />
        ))}
        <path d="M 146 122 Q 150 127 154 122" fill="none" stroke={SKIN_DARK} strokeWidth={2.5} strokeLinecap="round" />
        <Mouth face={pose.face} talking={talking} t={t} />

        {/* Arms and hands are drawn last so signs in front of the face stay visible */}
        <Arm hand={pose.L} shoulder={SHOULDER_L} outward={1} />
        <Arm hand={pose.R} shoulder={SHOULDER_R} outward={-1} />

        {letter && (
          <g transform={`translate(${Math.max(34, pose.R.x - 52)} ${pose.R.y - 62})`}>
            <rect x={-24} y={-24} width={48} height={48} rx={12} fill="#fff7e0" stroke="#e8b84a" strokeWidth={3} />
            <text x={0} y={11} textAnchor="middle" fontSize={32} fontWeight={800} fill={UNIFORM_DARK} fontFamily="system-ui, sans-serif">
              {letter}
            </text>
          </g>
        )}
      </g>
      <defs>
        <radialGradient id="puff" cx="0.35" cy="0.3" r="0.7">
          <stop offset="0" stopColor="#5a3a26" stopOpacity={0.6} />
          <stop offset="1" stopColor={HAIR} stopOpacity={0} />
        </radialGradient>
      </defs>
    </svg>
  )
}
