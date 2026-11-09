import type { NormalizedLandmark } from '@/hooks/use-hand-tracking'

export type Point3D = {
  x: number
  y: number
  z: number
}

export type FingerName = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky'

export type FingerFeatures = {
  name: FingerName
  /** Continuous extension ratio from 0.0 (curled) to 1.0 (extended) */
  extension: number
  /** Boolean thresholded state */
  isExtended: boolean
  isCurled: boolean
  /** Joint angles in degrees (MCP, PIP, DIP for fingers; CMC, MCP, IP for thumb) */
  angles: number[]
  /** Distance from tip to wrist normalized by palm scale */
  tipToWristDist: number
  /** Distance from tip to MCP base normalized by palm scale */
  tipToMcpDist: number
}

export type HandBoundingBox = {
  minX: number
  maxX: number
  minY: number
  maxY: number
  width: number
  height: number
  span: number
}

export type HandQualityStatus = 'optimal' | 'acceptable' | 'too_far' | 'edge_truncated'

export type HandMetrics = {
  boundingBox: HandBoundingBox
  handSizeRatio: number
  palmScale: number
  isNearEdge: boolean
  isTooSmall: boolean
  qualityStatus: HandQualityStatus
  qualityMessage: string
}

export type HandFeatures = {
  /** Distance from Wrist (0) to Middle MCP (9) used as scale reference */
  palmScale: number
  /** Distance from Index MCP (5) to Pinky MCP (17) */
  palmWidth: number
  /** Geometric tracking metrics and quality indicators */
  metrics: HandMetrics
  /** Features per finger */
  fingers: Record<FingerName, FingerFeatures>
  /** Normalized pairwise distances between fingertips */
  tipDistances: {
    thumbIndex: number
    thumbMiddle: number
    thumbRing: number
    thumbPinky: number
    indexMiddle: number
    middleRing: number
    ringPinky: number
    /** Max distance between any pair among the 5 fingertips */
    maxSpread: number
    /** Mean distance from fingertips to their centroid (Mukula cluster tightness) */
    clusterRadius: number
  }
  /** Thumb specific geometry */
  thumb: {
    /** Abduction angle relative to index MCP in degrees */
    abductionAngle: number
    /** Angle relative to palm upward axis (Wrist -> Middle MCP) in degrees */
    elevationAngle: number
    /** Whether thumb is stretched wide away from the palm */
    isAbducted: boolean
    /** Whether thumb points upward along the palm axis */
    isPointingUp: boolean
    /** Whether thumb tip is folded across the index/middle finger */
    isFoldedAcross: boolean
  }
  /** Average adjacent fingertip spread among extended fingers */
  fingerSpread: number
  /** 3D landmarks used */
  landmarks: Point3D[]
}

// MediaPipe landmark indices
export const LANDMARK_INDEX = {
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_DIP: 7,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_DIP: 11,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_PIP: 14,
  RING_DIP: 15,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_DIP: 19,
  PINKY_TIP: 20,
} as const

/** Euclidean distance in 3D */
export function dist3D(a: Point3D, b: Point3D): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = (a.z ?? 0) - (b.z ?? 0)
  return Math.hypot(dx, dy, dz)
}

/** Vector subtraction (b - a) */
export function vecSub(a: Point3D, b: Point3D): Point3D {
  return {
    x: b.x - a.x,
    y: b.y - a.y,
    z: (b.z ?? 0) - (a.z ?? 0),
  }
}

/** Dot product of two 3D vectors */
export function vecDot(u: Point3D, v: Point3D): number {
  return u.x * v.x + u.y * v.y + u.z * v.z
}

/** Magnitude of a 3D vector */
export function vecMag(v: Point3D): number {
  return Math.hypot(v.x, v.y, v.z)
}

/**
 * Computes angle at vertex B formed by rays BA and BC in degrees [0, 180].
 * Straight line = 180°, 90-degree bend = 90°.
 */
export function jointAngle(a: Point3D, b: Point3D, c: Point3D): number {
  const ba = vecSub(b, a)
  const bc = vecSub(b, c)
  const magBA = vecMag(ba)
  const magBC = vecMag(bc)
  if (magBA < 1e-6 || magBC < 1e-6) return 180
  const cosTheta = vecDot(ba, bc) / (magBA * magBC)
  const clamped = Math.max(-1, Math.min(1, cosTheta))
  return (Math.acos(clamped) * 180) / Math.PI
}

/** Helper clamp function */
function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}

/**
 * Computes bounding box, coverage span, and tracking quality indicators from landmarks.
 */
export function computeHandMetrics(lm: Point3D[], palmScale: number = 0.1): HandMetrics {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (let i = 0; i < lm.length; i++) {
    const p = lm[i]
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  const bbWidth = Number((maxX - minX).toFixed(3))
  const bbHeight = Number((maxY - minY).toFixed(3))
  const bbSpan = Number(Math.max(bbWidth, bbHeight).toFixed(3))

  const isNearEdge = minX <= 0.02 || maxX >= 0.98 || minY <= 0.02 || maxY >= 0.98
  const isTooSmall = bbSpan < 0.10 || palmScale < 0.04

  let qualityStatus: HandQualityStatus = 'optimal'
  let qualityMessage = 'Good hand size and tracking stability.'

  if (isNearEdge) {
    qualityStatus = 'edge_truncated'
    qualityMessage = 'Hand is near camera edge — move hand toward center of frame.'
  } else if (isTooSmall) {
    qualityStatus = 'too_far'
    qualityMessage = 'Hand is too far — move hand closer to camera.'
  } else if (bbSpan < 0.16 || palmScale < 0.07) {
    qualityStatus = 'acceptable'
    qualityMessage = 'Acceptable tracking. Move slightly closer for best recognition.'
  }

  return {
    boundingBox: {
      minX: Number(minX.toFixed(3)),
      maxX: Number(maxX.toFixed(3)),
      minY: Number(minY.toFixed(3)),
      maxY: Number(maxY.toFixed(3)),
      width: bbWidth,
      height: bbHeight,
      span: bbSpan,
    },
    handSizeRatio: bbSpan,
    palmScale: Number(palmScale.toFixed(4)),
    isNearEdge,
    isTooSmall,
    qualityStatus,
    qualityMessage,
  }
}

/**
 * Extracts scale-invariant, rotation-resilient geometric features from 21 MediaPipe hand landmarks.
 * Returns null if landmarks are missing, invalid, or degenerated.
 */
export function extractHandFeatures(rawLandmarks: NormalizedLandmark[] | null | undefined): HandFeatures | null {
  if (!rawLandmarks || rawLandmarks.length !== 21) {
    return null
  }

  // Verify coordinates are finite numbers
  for (let i = 0; i < 21; i++) {
    const p = rawLandmarks[i]
    if (
      !p ||
      typeof p.x !== 'number' ||
      typeof p.y !== 'number' ||
      !Number.isFinite(p.x) ||
      !Number.isFinite(p.y) ||
      (typeof p.z === 'number' && !Number.isFinite(p.z))
    ) {
      return null
    }
  }

  const lm: Point3D[] = rawLandmarks.map((p) => ({
    x: p.x,
    y: p.y,
    z: p.z ?? 0,
  }))

  const wrist = lm[LANDMARK_INDEX.WRIST]
  const middleMcp = lm[LANDMARK_INDEX.MIDDLE_MCP]
  const indexMcp = lm[LANDMARK_INDEX.INDEX_MCP]
  const pinkyMcp = lm[LANDMARK_INDEX.PINKY_MCP]

  // Palm scale anchor: Distance between Wrist (0) and Middle MCP (9)
  const palmScale = dist3D(wrist, middleMcp)
  if (palmScale < 1e-4) {
    return null
  }

  const palmWidth = dist3D(indexMcp, pinkyMcp) / palmScale

  // Palm upward vector: Wrist (0) -> Middle MCP (9)
  const palmUp = vecSub(wrist, middleMcp)

  // ─── 1. Finger Extension and Curl ──────────────────────────────────────────
  const fingerConfigs: {
    name: FingerName
    mcp: number
    pip: number
    dip: number
    tip: number
  }[] = [
    { name: 'index', mcp: 5, pip: 6, dip: 7, tip: 8 },
    { name: 'middle', mcp: 9, pip: 10, dip: 11, tip: 12 },
    { name: 'ring', mcp: 13, pip: 14, dip: 15, tip: 16 },
    { name: 'pinky', mcp: 17, pip: 18, dip: 19, tip: 20 },
  ]

  const fingers: Record<FingerName, FingerFeatures> = {} as any

  for (const cfg of fingerConfigs) {
    const mcpPt = lm[cfg.mcp]
    const pipPt = lm[cfg.pip]
    const dipPt = lm[cfg.dip]
    const tipPt = lm[cfg.tip]

    const pipAngle = jointAngle(mcpPt, pipPt, dipPt)
    const dipAngle = jointAngle(pipPt, dipPt, tipPt)
    const mcpAngle = jointAngle(wrist, mcpPt, pipPt)

    const tipToWrist = dist3D(tipPt, wrist) / palmScale
    const pipToWrist = dist3D(pipPt, wrist) / palmScale
    const tipToMcp = dist3D(tipPt, mcpPt) / palmScale

    // Flexion: 0° is completely straight, 90°+ is curled
    const pipFlex = Math.max(0, 180 - pipAngle)
    const dipFlex = Math.max(0, 180 - dipAngle)
    const jointStraightness = clamp(1 - (pipFlex + dipFlex) / 140, 0, 1)

    // Distance straightness: tipToMcp is ~1.1 to 1.5 when straight, ~0.4 to 0.6 when curled
    const distStraightness = clamp((tipToMcp - 0.5) / 0.65, 0, 1)

    // Composite extension score in [0, 1]
    const extension = 0.55 * distStraightness + 0.45 * jointStraightness

    // Extended if composite extension >= 0.60 and tip is farther from wrist than PIP (with resilience to perspective tilt)
    const isExtended = extension >= 0.60 && (tipToWrist > pipToWrist * 1.01 || jointStraightness >= 0.88)
    // Curled if extension <= 0.42 or tip is tucked close to MCP
    const isCurled = extension <= 0.42 || (tipToMcp < 0.62 && tipToWrist < pipToWrist * 1.08)

    fingers[cfg.name] = {
      name: cfg.name,
      extension: Number(extension.toFixed(3)),
      isExtended,
      isCurled,
      angles: [Math.round(mcpAngle), Math.round(pipAngle), Math.round(dipAngle)],
      tipToWristDist: Number(tipToWrist.toFixed(3)),
      tipToMcpDist: Number(tipToMcp.toFixed(3)),
    }
  }

  // ─── 2. Thumb Geometry ─────────────────────────────────────────────────────
  const thumbCmc = lm[LANDMARK_INDEX.THUMB_CMC]
  const thumbMcp = lm[LANDMARK_INDEX.THUMB_MCP]
  const thumbIp = lm[LANDMARK_INDEX.THUMB_IP]
  const thumbTip = lm[LANDMARK_INDEX.THUMB_TIP]

  const thumbCmcAngle = jointAngle(wrist, thumbCmc, thumbMcp)
  const thumbMcpAngle = jointAngle(thumbCmc, thumbMcp, thumbIp)
  const thumbIpAngle = jointAngle(thumbMcp, thumbIp, thumbTip)

  const thumbTipToWrist = dist3D(thumbTip, wrist) / palmScale
  const thumbTipToMcp = dist3D(thumbTip, thumbMcp) / palmScale
  const thumbTipToCmc = dist3D(thumbTip, thumbCmc) / palmScale

  // Straightness along thumb joints
  const thumbIpFlex = Math.max(0, 180 - thumbIpAngle)
  const thumbMcpFlex = Math.max(0, 180 - thumbMcpAngle)
  const thumbStraightness = clamp(1 - (thumbIpFlex + thumbMcpFlex) / 110, 0, 1)
  const thumbDistStraightness = clamp((thumbTipToCmc - 0.5) / 0.5, 0, 1)
  const thumbExtension = 0.5 * thumbDistStraightness + 0.5 * thumbStraightness

  // Thumb vector: CMC -> TIP
  const thumbVec = vecSub(thumbCmc, thumbTip)

  // Abduction angle: angle between thumb vector and index MCP vector (Wrist -> Index MCP)
  const indexVec = vecSub(wrist, indexMcp)
  const abductionAngle = Math.round(
    (Math.acos(
      clamp(
        vecDot(thumbVec, indexVec) / (vecMag(thumbVec) * vecMag(indexVec) || 1),
        -1,
        1,
      ),
    ) *
      180) /
      Math.PI,
  )

  // Elevation angle: angle between thumb vector and palm upward axis
  const elevationAngle = Math.round(
    (Math.acos(
      clamp(
        vecDot(thumbVec, palmUp) / (vecMag(thumbVec) * vecMag(palmUp) || 1),
        -1,
        1,
      ),
    ) *
      180) /
      Math.PI,
  )

  // Thumb tip distance to index MCP and PIP
  const distThumbToIndexMcp = dist3D(thumbTip, indexMcp) / palmScale
  const distThumbToIndexPip = dist3D(thumbTip, lm[LANDMARK_INDEX.INDEX_PIP]) / palmScale
  const distThumbToMiddlePip = dist3D(thumbTip, lm[LANDMARK_INDEX.MIDDLE_PIP]) / palmScale

  const isThumbAbducted = abductionAngle > 46 && distThumbToIndexMcp > 0.72
  const isThumbPointingUp = elevationAngle < 48 && thumbExtension > 0.52 && thumbTipToWrist > 0.70
  const isThumbFoldedAcross =
    (distThumbToIndexPip < 0.52 || distThumbToMiddlePip < 0.52) && !isThumbPointingUp

  fingers.thumb = {
    name: 'thumb',
    extension: Number(thumbExtension.toFixed(3)),
    isExtended: thumbExtension >= 0.6,
    isCurled: thumbExtension < 0.45 || isThumbFoldedAcross,
    angles: [Math.round(thumbCmcAngle), Math.round(thumbMcpAngle), Math.round(thumbIpAngle)],
    tipToWristDist: Number(thumbTipToWrist.toFixed(3)),
    tipToMcpDist: Number(thumbTipToMcp.toFixed(3)),
  }

  // ─── 3. Inter-Fingertip Distances ──────────────────────────────────────────
  const indexTip = lm[LANDMARK_INDEX.INDEX_TIP]
  const middleTip = lm[LANDMARK_INDEX.MIDDLE_TIP]
  const ringTip = lm[LANDMARK_INDEX.RING_TIP]
  const pinkyTip = lm[LANDMARK_INDEX.PINKY_TIP]

  const dThumbIndex = dist3D(thumbTip, indexTip) / palmScale
  const dThumbMiddle = dist3D(thumbTip, middleTip) / palmScale
  const dThumbRing = dist3D(thumbTip, ringTip) / palmScale
  const dThumbPinky = dist3D(thumbTip, pinkyTip) / palmScale

  const dIndexMiddle = dist3D(indexTip, middleTip) / palmScale
  const dMiddleRing = dist3D(middleTip, ringTip) / palmScale
  const dRingPinky = dist3D(ringTip, pinkyTip) / palmScale

  const allTips = [thumbTip, indexTip, middleTip, ringTip, pinkyTip]

  // Centroid of the 5 fingertips
  const centroid: Point3D = {
    x: allTips.reduce((s, p) => s + p.x, 0) / 5,
    y: allTips.reduce((s, p) => s + p.y, 0) / 5,
    z: allTips.reduce((s, p) => s + (p.z ?? 0), 0) / 5,
  }

  let maxSpread = 0
  for (let i = 0; i < allTips.length; i++) {
    for (let j = i + 1; j < allTips.length; j++) {
      const d = dist3D(allTips[i], allTips[j]) / palmScale
      if (d > maxSpread) maxSpread = d
    }
  }

  let clusterRadius = 0
  for (const tip of allTips) {
    const d = dist3D(tip, centroid) / palmScale
    if (d > clusterRadius) clusterRadius = d
  }

  // Spread of the 4 fingers
  const fingerSpread = Number(((dIndexMiddle + dMiddleRing + dRingPinky) / 3).toFixed(3))

  // ─── 4. Hand Bounding Box & Tracking Quality Metrics ──────────────────────
  const metrics = computeHandMetrics(lm, palmScale)

  return {
    palmScale: Number(palmScale.toFixed(4)),
    palmWidth: Number(palmWidth.toFixed(3)),
    metrics,
    fingers,
    tipDistances: {
      thumbIndex: Number(dThumbIndex.toFixed(3)),
      thumbMiddle: Number(dThumbMiddle.toFixed(3)),
      thumbRing: Number(dThumbRing.toFixed(3)),
      thumbPinky: Number(dThumbPinky.toFixed(3)),
      indexMiddle: Number(dIndexMiddle.toFixed(3)),
      middleRing: Number(dMiddleRing.toFixed(3)),
      ringPinky: Number(dRingPinky.toFixed(3)),
      maxSpread: Number(maxSpread.toFixed(3)),
      clusterRadius: Number(clusterRadius.toFixed(3)),
    },
    thumb: {
      abductionAngle,
      elevationAngle,
      isAbducted: isThumbAbducted,
      isPointingUp: isThumbPointingUp,
      isFoldedAcross: isThumbFoldedAcross,
    },
    fingerSpread,
    landmarks: lm,
  }
}
