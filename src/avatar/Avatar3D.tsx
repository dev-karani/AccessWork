import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { HandPose, Pose, Shape } from './types'

const MODEL_URL = '/models/michelle.glb'

const FINGERS = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'] as const
type Finger = (typeof FINGERS)[number]

/** Curl per finger (0 = straight, 1 = fully bent) in the order thumb, index, middle, ring, pinky. */
const CURL: Record<Shape, number[]> = {
  open: [0, 0, 0, 0, 0],
  flat: [0.25, 0, 0, 0, 0],
  fist: [0.75, 1, 1, 1, 1],
  point: [0.75, 0, 1, 1, 1],
  vee: [0.75, 0, 0, 1, 1],
  thumb: [0, 1, 1, 1, 1],
  ok: [0.55, 0.65, 0, 0.05, 0.1],
  cup: [0.3, 0.5, 0.5, 0.5, 0.5],
}
/** Sideways spread in degrees towards the index side. */
const SPREAD: Record<Shape, number[]> = {
  open: [0, 10, 0, -7, -14],
  flat: [0, 0, 0, 0, 0],
  fist: [0, 0, 0, 0, 0],
  point: [0, 0, 0, 0, 0],
  vee: [0, 12, -8, 0, 0],
  thumb: [0, 0, 0, 0, 0],
  ok: [0, 0, 0, -6, -12],
  cup: [0, 4, 0, -3, -6],
}
const JOINT_DEG = { finger: [70, 95, 65], thumb: [35, 40, 35] }

interface FingerRig {
  bones: THREE.Bone[]
  bind: THREE.Quaternion[]
  curlAxis: THREE.Vector3[]
  spreadAxis: THREE.Vector3
}

interface ArmRig {
  upper: THREE.Bone
  fore: THREE.Bone
  hand: THREE.Bone
  shoulderWorldQ: THREE.Quaternion
  upperBindQ: THREE.Quaternion
  foreBindQ: THREE.Quaternion
  handBindQ: THREE.Quaternion
  upperDir: THREE.Vector3
  foreDir: THREE.Vector3
  handBasisInv: THREE.Matrix4
  S: THREE.Vector3
  L1: number
  L2: number
  fingers: Record<Finger, FingerRig>
  curl: number[]
  spread: number[]
}

const v = () => new THREE.Vector3()
const worldPos = (o: THREE.Object3D) => o.getWorldPosition(v())
const worldQuat = (o: THREE.Object3D) => o.getWorldQuaternion(new THREE.Quaternion())

/** Pick the local rotation axis sign so a small positive rotation moves `tip` towards `towards`. */
function orientAxis(bone: THREE.Bone, tip: THREE.Object3D, axisLocal: THREE.Vector3, towards: THREE.Vector3) {
  const saved = bone.quaternion.clone()
  const before = worldPos(tip)
  bone.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(axisLocal, 0.2))
  bone.updateMatrixWorld(true)
  const moved = worldPos(tip).sub(before)
  bone.quaternion.copy(saved)
  bone.updateMatrixWorld(true)
  return moved.dot(towards) >= 0 ? axisLocal : axisLocal.clone().negate()
}

function buildArm(root: THREE.Object3D, side: 'Right' | 'Left'): ArmRig {
  const get = (name: string) => {
    const b = root.getObjectByName(`mixamorig${name}`) ?? root.getObjectByName(`mixamorig:${name}`)
    if (!b) throw new Error(`Bone ${name} not found`)
    return b as THREE.Bone
  }
  const upper = get(`${side}Arm`)
  const fore = get(`${side}ForeArm`)
  const hand = get(`${side}Hand`)
  const S = worldPos(upper)
  const E = worldPos(fore)
  const H = worldPos(hand)
  const middle1 = worldPos(get(`${side}HandMiddle1`))
  const index1 = worldPos(get(`${side}HandIndex1`))
  const pinky1 = worldPos(get(`${side}HandPinky1`))

  const f0 = middle1.clone().sub(H).normalize()
  const across = index1.clone().sub(pinky1).normalize()
  const n0 = (side === 'Right' ? across.clone().cross(f0) : f0.clone().cross(across)).normalize()
  const s0 = f0.clone().cross(n0).normalize()
  const handBasisInv = new THREE.Matrix4().makeBasis(f0, n0, s0).transpose()

  const fingers = {} as Record<Finger, FingerRig>
  for (const name of FINGERS) {
    const bones = [1, 2, 3].map((i) => get(`${side}Hand${name}${i}`))
    const tip = get(`${side}Hand${name}4`)
    const bind = bones.map((b) => b.quaternion.clone())
    let worldAxis = s0
    if (name === 'Thumb') {
      const t0 = worldPos(bones[1]).sub(worldPos(bones[0])).normalize()
      worldAxis = t0.clone().cross(n0).normalize()
    }
    const curlAxis = bones.map((b, i) => {
      const local = worldAxis.clone().applyQuaternion(worldQuat(b).invert()).normalize()
      return orientAxis(b, i < 2 ? bones[i + 1] : tip, local, n0)
    })
    const spreadLocal = n0.clone().applyQuaternion(worldQuat(bones[0]).invert()).normalize()
    const spreadAxis = orientAxis(bones[0], bones[1], spreadLocal, across)
    fingers[name] = { bones, bind, curlAxis, spreadAxis }
  }

  return {
    upper,
    fore,
    hand,
    shoulderWorldQ: worldQuat(upper.parent!),
    upperBindQ: worldQuat(upper),
    foreBindQ: worldQuat(fore),
    handBindQ: worldQuat(hand),
    upperDir: E.clone().sub(S).normalize(),
    foreDir: H.clone().sub(E).normalize(),
    handBasisInv,
    S,
    L1: E.distanceTo(S),
    L2: H.distanceTo(E),
    fingers,
    curl: [...CURL.flat],
    spread: [...SPREAD.flat],
  }
}

const tmpQ = new THREE.Quaternion()

/** Solve a two-bone arm so the wrist reaches `target`, with the elbow bending towards `pole`. */
function applyArm(rig: ArmRig, target: THREE.Vector3, pole: THREE.Vector3, fingerDir: THREE.Vector3, palmDir: THREE.Vector3) {
  const { S, L1, L2 } = rig
  const toT = target.clone().sub(S)
  const len = toT.length() || 1e-4
  const d = THREE.MathUtils.clamp(len, Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-3)
  const dir = toT.divideScalar(len)
  const T = S.clone().addScaledVector(dir, d)
  const cosA = THREE.MathUtils.clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1)
  const sinA = Math.sqrt(1 - cosA * cosA)
  const poleOrth = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize()
  const E = S.clone().addScaledVector(dir, cosA * L1).addScaledVector(poleOrth, sinA * L1)

  const upperSwing = new THREE.Quaternion().setFromUnitVectors(rig.upperDir, E.clone().sub(S).normalize())
  const upperWorld = upperSwing.clone().multiply(rig.upperBindQ)
  rig.upper.quaternion.copy(tmpQ.copy(rig.shoulderWorldQ).invert().multiply(upperWorld))

  const foreDirNow = rig.foreDir.clone().applyQuaternion(upperSwing)
  const foreSwing = new THREE.Quaternion().setFromUnitVectors(foreDirNow, T.clone().sub(E).normalize())
  const foreWorld = foreSwing.multiply(upperSwing).multiply(rig.foreBindQ)
  rig.fore.quaternion.copy(tmpQ.copy(upperWorld).invert().multiply(foreWorld))

  const f1 = fingerDir.clone().normalize()
  const n1 = palmDir.clone().addScaledVector(f1, -palmDir.dot(f1)).normalize()
  const s1 = f1.clone().cross(n1).normalize()
  const m = new THREE.Matrix4().makeBasis(f1, n1, s1).multiply(rig.handBasisInv)
  const handWorld = new THREE.Quaternion().setFromRotationMatrix(m).multiply(rig.handBindQ)
  rig.hand.quaternion.copy(tmpQ.copy(foreWorld).invert().multiply(handWorld))
}

function applyFingers(rig: ArmRig, shape: Shape, blend: number) {
  const curl = CURL[shape]
  const spread = SPREAD[shape]
  FINGERS.forEach((name, fi) => {
    rig.curl[fi] += (curl[fi] - rig.curl[fi]) * blend
    rig.spread[fi] += (spread[fi] - rig.spread[fi]) * blend
    const f = rig.fingers[name]
    const degs = name === 'Thumb' ? JOINT_DEG.thumb : JOINT_DEG.finger
    f.bones.forEach((bone, j) => {
      bone.quaternion.copy(f.bind[j])
      if (j === 0 && rig.spread[fi]) {
        bone.quaternion.multiply(tmpQ.setFromAxisAngle(f.spreadAxis, THREE.MathUtils.degToRad(rig.spread[fi])))
      }
      bone.quaternion.multiply(tmpQ.setFromAxisAngle(f.curlAxis[j], THREE.MathUtils.degToRad(degs[j] * rig.curl[fi])))
    })
  })
}

interface Rig {
  R: ArmRig
  L: ArmRig
  head: THREE.Bone | null
  headBind: THREE.Quaternion
  body: BodyMap
}

/**
 * The 2D sign library uses cartoon proportions (big head), so heights are mapped through body
 * landmarks (head top, eyes, chin, shoulders, chest, belly) instead of one uniform scale.
 */
interface BodyMap {
  ys2D: number[]
  ys3D: number[]
  centerX: number
  xScale: number
  frontZ: number
  faceZ: number
}

const ANCHORS_2D = [46, 105, 170, 207, 250, 290, 380]

function buildBodyMap(model: THREE.Object3D, R: ArmRig, L: ArmRig): BodyMap {
  const find = (n: string) => model.getObjectByName(`mixamorig${n}`) ?? model.getObjectByName(`mixamorig:${n}`)
  const reach = R.L1 + R.L2
  const y = (n: string, fallback: number) => {
    const o = find(n)
    return o ? worldPos(o).y : fallback
  }
  const shoulderY = (R.S.y + L.S.y) / 2
  const head = y('Head', shoulderY + reach * 0.25)
  const top = y('HeadTop_End', head + reach * 0.35)
  const chest = y('Spine2', shoulderY - reach * 0.2)
  const belly = y('Spine', shoulderY - reach * 0.5)
  const hips = y('Hips', shoulderY - reach * 0.75)
  const headZ = find('Head') ? worldPos(find('Head')!).z : R.S.z
  return {
    ys2D: ANCHORS_2D,
    ys3D: [top, head + (top - head) * 0.42, head - (top - head) * 0.1, shoulderY, chest * 0.6 + belly * 0.4, belly, hips - reach * 0.7],
    centerX: (R.S.x + L.S.x) / 2,
    xScale: Math.abs(L.S.x - R.S.x) / 2 / 50,
    frontZ: R.S.z + reach * 0.42,
    faceZ: headZ + reach * 0.3,
  }
}

function mapY(body: BodyMap, y2: number) {
  const { ys2D: a, ys3D: b } = body
  let i = 0
  while (i < a.length - 2 && y2 > a[i + 1]) i++
  return b[i] + ((y2 - a[i]) / (a[i + 1] - a[i])) * (b[i + 1] - b[i])
}

/** Map a hand pose from the 2D sign space onto a reachable 3D wrist target in front of the body. */
function target3D(arm: ArmRig, body: BodyMap, hand: HandPose) {
  const reach = arm.L1 + arm.L2
  const x = body.centerX + (hand.x - 150) * body.xScale
  const y = mapY(body, hand.y)
  const nearFace = hand.y < 185 && Math.abs(hand.x - 150) < 45
  const resting = THREE.MathUtils.clamp((hand.y - 285) / 30, 0, 1)
  const wantZ = nearFace ? body.faceZ : THREE.MathUtils.lerp(body.frontZ, arm.S.z + reach * 0.08, resting)
  const planar = Math.hypot(x - arm.S.x, y - arm.S.y)
  const maxForward = Math.sqrt(Math.max(0, (0.97 * reach) ** 2 - planar ** 2))
  const z = arm.S.z + Math.min(wantZ - arm.S.z, maxForward)
  const outward = Math.sign(arm.S.x - body.centerX) * reach * 0.12
  const hanging = new THREE.Vector3(arm.S.x + outward, arm.S.y - reach * 0.93, arm.S.z + reach * 0.08)
  return new THREE.Vector3(x, y, z).lerp(hanging, resting)
}

function handDirections(hand: HandPose, side: 'R' | 'L') {
  const r = THREE.MathUtils.degToRad(hand.rot)
  const finger = new THREE.Vector3(Math.sin(r), Math.cos(r), 0.2)
  const inward = new THREE.Vector3(side === 'R' ? 1 : -1, 0, 0.2)
  const resting = THREE.MathUtils.clamp((hand.y - 285) / 30, 0, 1)
  const palm = new THREE.Vector3(0, 0, 1).lerp(inward, resting)
  return { finger, palm }
}

interface Avatar3DProps {
  pose: Pose
  talking: boolean
  letter: string | null
}

/** Zuri in 3D: a rigged Mixamo character whose arms and fingers follow the same sign poses as the 2D avatar. */
export function Avatar3D({ pose, talking, letter }: Avatar3DProps) {
  const mount = useRef<HTMLDivElement>(null)
  const poseRef = useRef(pose)
  const talkingRef = useRef(talking)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    poseRef.current = pose
    talkingRef.current = talking
  }, [pose, talking])

  useEffect(() => {
    const el = mount.current
    if (!el) return
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    el.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(26, 1, 0.05, 50)
    scene.add(new THREE.HemisphereLight(0xfff6ea, 0x6b5a48, 1.8))
    const key = new THREE.DirectionalLight(0xffffff, 2.4)
    key.position.set(1.2, 2.5, 3)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0xffe2c4, 0.9)
    fill.position.set(-2, 1, 1.5)
    scene.add(fill)

    let rig: Rig | null = null
    let frame = 0
    let disposed = false
    const started = performance.now()

    const resize = () => {
      const w = el.clientWidth || 300
      const h = el.clientHeight || 380
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    resize()

    new GLTFLoader().load(
      MODEL_URL,
      (gltf) => {
        if (disposed) return
        const model = gltf.scene
        model.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) o.frustumCulled = false
        })
        scene.add(model)

        const tpose = gltf.animations.find((a) => a.name === 'TPose')
        if (tpose) {
          const mixer = new THREE.AnimationMixer(model)
          mixer.clipAction(tpose).play()
          mixer.update(0)
          const saved: Array<[THREE.Object3D, THREE.Quaternion, THREE.Vector3]> = []
          model.traverse((o) => saved.push([o, o.quaternion.clone(), o.position.clone()]))
          mixer.stopAllAction()
          mixer.uncacheRoot(model)
          saved.forEach(([o, q, p]) => {
            o.quaternion.copy(q)
            o.position.copy(p)
          })
        }
        model.updateMatrixWorld(true)

        try {
          const head = (model.getObjectByName('mixamorigHead') ?? model.getObjectByName('mixamorig:Head')) as THREE.Bone | null
          const R = buildArm(model, 'Right')
          const L = buildArm(model, 'Left')
          rig = { R, L, head, headBind: head?.quaternion.clone() ?? new THREE.Quaternion(), body: buildBodyMap(model, R, L) }
        } catch (e) {
          console.error(e)
          setStatus('error')
          return
        }

        const midY = (rig.R.S.y + rig.L.S.y) / 2
        const headTop = model.getObjectByName('mixamorigHeadTop_End') ?? model.getObjectByName('mixamorig:HeadTop_End')
        const reach = rig.R.L1 + rig.R.L2
        const top = (headTop ? worldPos(headTop).y : midY + reach * 0.7) + reach * 0.12
        const bottom = midY - reach * 1.0
        const height = top - bottom
        const center = (top + bottom) / 2
        const dist = height / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
        camera.position.set(0, center + height * 0.04, rig.R.S.z + dist * 1.05)
        camera.lookAt(0, center, 0)
        setStatus('ready')
      },
      undefined,
      (err) => {
        console.error(err)
        if (!disposed) setStatus('error')
      },
    )

    const pole = { R: new THREE.Vector3(-1, -1.3, -0.4), L: new THREE.Vector3(1, -1.3, -0.4) }
    const loop = () => {
      frame = requestAnimationFrame(loop)
      const t = (performance.now() - started) / 1000
      if (rig) {
        const p = poseRef.current
        const blend = 0.3
        for (const side of ['R', 'L'] as const) {
          const arm = rig[side]
          const hand = p[side]
          const { finger, palm } = handDirections(hand, side)
          applyArm(arm, target3D(arm, rig.body, hand), pole[side], finger, palm)
          applyFingers(arm, hand.shape, blend)
        }
        if (rig.head) {
          const tilt = p.face === 'question' ? -0.12 : p.face === 'sad' ? 0.14 : 0
          const nod = talkingRef.current ? Math.sin(t * 7) * 0.025 : 0
          const e = new THREE.Euler(tilt + nod + Math.sin(t * 0.8) * 0.015, Math.sin(t * 0.5) * 0.06, p.face === 'question' ? 0.08 : 0)
          rig.head.quaternion.copy(rig.headBind).multiply(tmpQ.setFromEuler(e))
        }
      }
      renderer.render(scene, camera)
    }
    loop()

    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      ro.disconnect()
      renderer.dispose()
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh
        mesh.geometry?.dispose()
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
        else mat?.dispose()
      })
      el.removeChild(renderer.domElement)
    }
  }, [])

  return (
    <div className="avatar3d" ref={mount} role="img" aria-label="Zuri, the 3D signing avatar">
      {status === 'loading' && <div className="avatar3d-msg">Loading 3D avatar…</div>}
      {status === 'error' && <div className="avatar3d-msg">The 3D avatar could not load. Switch to the cartoon avatar.</div>}
      {letter && <div className="letter-bubble">{letter}</div>}
    </div>
  )
}
