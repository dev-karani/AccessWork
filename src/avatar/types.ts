export type Shape = 'open' | 'flat' | 'fist' | 'point' | 'vee' | 'thumb' | 'ok' | 'cup'

export type Face = 'smile' | 'question' | 'sad' | 'serious'

/** Hand position in avatar SVG coordinates. `rot` is degrees, 0 = fingers pointing up. */
export interface HandPose {
  x: number
  y: number
  rot: number
  shape: Shape
}

export interface Pose {
  /** Avatar's right hand (appears on the viewer's left). This is the dominant signing hand. */
  R: HandPose
  /** Avatar's left hand (appears on the viewer's right). */
  L: HandPose
  face: Face
}

export interface Keyframe {
  R?: HandPose
  L?: HandPose
  face?: Face
  /** Time in ms to move into this pose. */
  dur: number
  /** Time in ms to hold the pose once reached. */
  hold?: number
  /** Letter shown in a bubble while fingerspelling. */
  letter?: string
}

export interface Gloss {
  /** Uppercase gloss label shown under the avatar, e.g. "THANK-YOU" or "J-A-M-E-S". */
  label: string
  frames: Keyframe[]
  spelled: boolean
}
