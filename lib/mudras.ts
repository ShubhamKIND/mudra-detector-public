export type MudraId =
  | 'musti'
  | 'pataka'
  | 'alapadma'
  | 'suchi'
  | 'shikhara'
  | 'ardhachandra'
  | 'tripataka'
  | 'ardhapataka'
  | 'mayura'
  | 'mukula'

export type HandPoint = { x: number; y: number }

/** Four fingers in order: index, middle, ring, pinky. */
type FingerTuple = [number, number, number, number]

export type HandPose = {
  curl: FingerTuple
  spread: FingerTuple
  thumbAngle: number
  thumbCurl: number
  /** Fingers (0 = index … 3 = pinky) whose tips meet the thumb tip. */
  meet?: number[]
}

export type Mudra = {
  id: MudraId
  name: string
  devanagari: string
  translation: string
  meaning: string
  guidance: string
  pose: HandPose
}

export const MUDRAS: Mudra[] = [
  {
    id: 'musti',
    name: 'Musti',
    devanagari: 'मुष्टि',
    translation: 'The Fist',
    meaning: 'Steadfastness, grasping, holding a weapon, combat.',
    guidance: 'Fold all four fingers into the palm and rest the thumb across them.',
    pose: { curl: [1, 1, 1, 1], spread: [0, 0, 0, 0], thumbAngle: 35, thumbCurl: 0.25 },
  },
  {
    id: 'pataka',
    name: 'Pataka',
    devanagari: 'पताका',
    translation: 'The Flag',
    meaning: 'Clouds, a forest, a river, the beginning of a dance.',
    guidance: 'Keep all fingers straight and joined; bend the thumb to rest beside the index.',
    pose: { curl: [0, 0, 0, 0], spread: [5, 0, -4, -10], thumbAngle: -12, thumbCurl: 0.35 },
  },
  {
    id: 'alapadma',
    name: 'Alapadma',
    devanagari: 'अलपद्म',
    translation: 'The Bloomed Lotus',
    meaning: 'A full-blown lotus, the full moon, beauty, a lake.',
    guidance: 'Spread every finger apart in a gentle fan, like petals opening.',
    pose: { curl: [0.05, 0.05, 0.05, 0.05], spread: [-18, -5, 10, 24], thumbAngle: -62, thumbCurl: 0 },
  },
  {
    id: 'suchi',
    name: 'Suchi',
    devanagari: 'सूचि',
    translation: 'The Needle',
    meaning: 'The number one, the universe, pointing, a question.',
    guidance: 'Raise only the index finger; curl the others and close the thumb over them.',
    pose: { curl: [0, 1, 1, 1], spread: [2, 0, 0, 0], thumbAngle: 30, thumbCurl: 0.3 },
  },
  {
    id: 'shikhara',
    name: 'Shikhara',
    devanagari: 'शिखर',
    translation: 'The Peak',
    meaning: 'A bow, a pillar, steadiness, Kama the god of love.',
    guidance: 'Make a fist and lift the thumb straight upward.',
    pose: { curl: [1, 1, 1, 1], spread: [0, 0, 0, 0], thumbAngle: -4, thumbCurl: 0 },
  },
  {
    id: 'ardhachandra',
    name: 'Ardhachandra',
    devanagari: 'अर्धचन्द्र',
    translation: 'The Half Moon',
    meaning: 'The crescent moon, an offering, meditation, a spear.',
    guidance: 'Hold the fingers straight and joined; stretch the thumb fully outward.',
    pose: { curl: [0, 0, 0, 0], spread: [5, 0, -4, -10], thumbAngle: -82, thumbCurl: 0 },
  },
  {
    id: 'tripataka',
    name: 'Tripataka',
    devanagari: 'त्रिपताका',
    translation: 'Three Parts of the Flag',
    meaning: 'A crown, a tree, the thunderbolt, a flame.',
    guidance: 'From Pataka, bend only the ring finger down.',
    pose: { curl: [0, 0, 0.9, 0], spread: [5, 0, -4, -6], thumbAngle: -12, thumbCurl: 0.35 },
  },
  {
    id: 'ardhapataka',
    name: 'Ardhapataka',
    devanagari: 'अर्धपताका',
    translation: 'The Half Flag',
    meaning: 'Tender leaves, a knife, a tower, a riverbank.',
    guidance: 'From Pataka, bend both the ring and little fingers down.',
    pose: { curl: [0, 0, 0.9, 0.9], spread: [5, 0, -4, -6], thumbAngle: -12, thumbCurl: 0.35 },
  },
  {
    id: 'mayura',
    name: 'Mayura',
    devanagari: 'मयूर',
    translation: 'The Peacock',
    meaning: "A peacock's neck, applying tilak, a vine, a bird.",
    guidance: 'Touch the tip of the ring finger to the thumb; keep the others extended.',
    pose: { curl: [0, 0, 0.55, 0], spread: [-6, 0, 4, 18], thumbAngle: -10, thumbCurl: 0.6, meet: [2] },
  },
  {
    id: 'mukula',
    name: 'Mukula',
    devanagari: 'मुकुल',
    translation: 'The Bud',
    meaning: 'A lotus bud, eating, an offering, the navel.',
    guidance: 'Gather all five fingertips together into a closed bud.',
    pose: { curl: [0.3, 0.3, 0.3, 0.3], spread: [10, 3, -5, -14], thumbAngle: 10, thumbCurl: 0.5, meet: [0, 1, 2, 3] },
  },
]

export const getMudra = (id: MudraId) => MUDRAS.find((m) => m.id === id) ?? MUDRAS[0]

/** MediaPipe-compatible 21-point hand connections. */
export const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
]

const FINGER_BASES: HandPoint[] = [
  { x: -0.32, y: -0.92 },
  { x: -0.1, y: -1.0 },
  { x: 0.13, y: -0.96 },
  { x: 0.33, y: -0.84 },
]
const FINGER_ANGLES = [-8, 0, 7, 15]
const FINGER_LENGTHS = [
  [0.42, 0.25, 0.2],
  [0.47, 0.28, 0.21],
  [0.43, 0.26, 0.2],
  [0.33, 0.2, 0.17],
]
const JOINT_FLEX = [85, 100, 70]
const THUMB_CMC: HandPoint = { x: -0.24, y: -0.2 }
const THUMB_LENGTHS = [0.32, 0.28, 0.24]

const rad = (deg: number) => (deg * Math.PI) / 180
const lerp = (a: HandPoint, b: HandPoint, t: number) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
})

/**
 * Builds an illustrative 21-point hand in a palm-facing frontal projection.
 * Wrist sits at the origin and the hand extends toward negative y.
 * Used only for visual previews — real landmarks come from the recognition engine.
 */
export function poseToLandmarks(pose: HandPose): HandPoint[] {
  const points: HandPoint[] = [{ x: 0, y: 0 }, THUMB_CMC]

  let thumbDir = pose.thumbAngle
  let cursor = THUMB_CMC
  for (const length of THUMB_LENGTHS) {
    cursor = {
      x: cursor.x + Math.sin(rad(thumbDir)) * length,
      y: cursor.y - Math.cos(rad(thumbDir)) * length,
    }
    points.push(cursor)
    thumbDir += pose.thumbCurl * 38
  }

  FINGER_BASES.forEach((base, f) => {
    const direction = rad(FINGER_ANGLES[f] + pose.spread[f])
    const ux = Math.sin(direction)
    const uy = -Math.cos(direction)
    let flex = 0
    let p = base
    points.push(p)
    FINGER_LENGTHS[f].forEach((length, j) => {
      flex += JOINT_FLEX[j] * pose.curl[f]
      const projected = length * Math.cos(rad(flex))
      const sideways = length * Math.sin(rad(flex)) * 0.12
      p = { x: p.x + ux * projected - uy * sideways, y: p.y + uy * projected + ux * sideways }
      points.push(p)
    })
  })

  if (pose.meet?.length) {
    const tips = [4, ...pose.meet.map((f) => 8 + f * 4)]
    const meetAt = tips.reduce(
      (acc, i) => ({ x: acc.x + points[i].x / tips.length, y: acc.y + points[i].y / tips.length }),
      { x: 0, y: 0 },
    )
    tips.forEach((i) => {
      points[i - 1] = lerp(points[i - 1], meetAt, 0.45)
      points[i] = meetAt
    })
  }

  return points
}

export const RESTING_POSE: HandPose = {
  curl: [0.12, 0.1, 0.14, 0.18],
  spread: [-4, 0, 3, 8],
  thumbAngle: -40,
  thumbCurl: 0.15,
}
