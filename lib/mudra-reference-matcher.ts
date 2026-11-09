/**
 * mudra-reference-matcher.ts
 *
 * Reference-based mudra matching engine (experimental, Phase 5B).
 *
 * This module compares live MediaPipe landmarks against the small set of
 * supplied reference samples and returns candidate rankings by mean
 * per-landmark distance in a common normalized space.
 *
 * It is an EXPERIMENTAL layer that runs alongside the existing geometric
 * rule engine. It does not replace rule-based recognition and does not
 * feed into the production stabilizer. Its results are surfaced only in
 * the developer calibration dashboard.
 *
 * # Coordinate Normalization
 *
 * Both the live landmarks from MediaPipe and the stored reference samples
 * use the same normalization before comparison:
 *
 *   1. Translate all 21 points so landmark 0 (Wrist) becomes (0, 0, 0).
 *   2. Divide every coordinate by the Euclidean distance between landmark
 *      0 (Wrist) and landmark 9 (Middle MCP). This is the same palmScale
 *      used in extractHandFeatures().
 *
 * After this transform, all shapes are translation- and scale-invariant.
 * Rotation is NOT removed — both the reference samples and live MediaPipe
 * output are approximately "palm-facing-camera" poses, so a fixed-frame
 * comparison is reasonable here.
 *
 * # Z-Axis Weighting
 *
 * MediaPipe's z-coordinate is depth relative to the wrist and is noisier
 * than x/y. A configurable zWeight (default 0.4) reduces z's contribution
 * to the per-landmark distance without discarding it entirely.
 *
 * # Distance Metric
 *
 * Per-landmark Euclidean distance with z-weighting, averaged over 21 points:
 *
 *   dist_i = sqrt((dx)^2 + (dy)^2 + (zWeight * dz)^2)
 *   meanDist(query, ref) = mean(dist_i, i=0..20)
 *
 * # Per-Mudra Aggregation
 *
 * Multiple samples exist for each mudra (the supplied set has 2 per class).
 * The best-matching (minimum-distance) sample per mudra is used as the
 * representative distance for that mudra. This is a nearest-neighbour
 * lookup within each class.
 *
 * # Uncertainty
 *
 * A result is called "uncertain" when:
 *   - No hand is detected (null landmarks).
 *   - The best distance exceeds UNCERTAIN_DISTANCE_THRESHOLD.
 *   - The margin between top and runner-up is below UNCERTAIN_MARGIN.
 *
 * # Thresholds and Calibration
 *
 * The thresholds below are INITIAL estimates derived from the intra-class
 * distances observed in the supplied samples (all ~0.045–0.062). They
 * have NOT been calibrated against real webcam poses and MUST be revisited
 * once webcam testing data is collected. See calibration notes in comments.
 */

import type { NormalizedLandmark } from '@/hooks/use-hand-tracking'
import type { MudraId } from './mudras.ts'
import { MUDRA_REFERENCE_SAMPLES, type ReferenceSample } from './mudra-reference-data.ts'

export type RefMatchCandidate = {
  mudra: MudraId
  /** Mean per-landmark distance (lower = closer match). Range ≥ 0. */
  meanDist: number
  /** Index of the nearest sample within this mudra's reference pool */
  nearestSampleIndex: number
  /** Whether any reference samples exist for this mudra */
  hasSamples: boolean
}

export type RefMatchResult = {
  status: 'matched' | 'uncertain' | 'no_hand'
  /** Top candidate (smallest distance), if any samples exist */
  topCandidate: RefMatchCandidate | null
  /** Second-closest mudra, for margin analysis */
  runnerUp: RefMatchCandidate | null
  /**
   * Distance gap between top and runner-up (meanDist(runner) - meanDist(top)).
   * Large margin = more confident. Only set when topCandidate exists.
   */
  margin: number | null
  /**
   * All candidates with reference samples, ranked ascending by meanDist.
   */
  candidates: RefMatchCandidate[]
  /** Mudras in the registry that have NO supplied reference samples */
  unsupportedMudras: MudraId[]
  /** Orientation used for best match ('direct' for right-hand pose, 'mirrored' for left-hand pose) */
  matchedOrientation?: 'direct' | 'mirrored'
  /** Overall tracking quality assessment */
  qualityStatus?: 'optimal' | 'acceptable' | 'too_far' | 'edge_truncated'
  /** Diagnostic reason if uncertain */
  reason?: string
  thresholds: {
    uncertainDistanceThreshold: number
    uncertainMargin: number
    zWeight: number
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Thresholds
// NOTE: These are INITIAL estimates. Calibrate against real webcam data.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maximum mean distance for the top candidate to be called "matched".
 * Empirically, intra-class distances in the supplied samples range ~0.045–0.062.
 * We set an initial threshold at 0.35 — roughly 5–6× intra-class variance —
 * to tolerate real-world pose variation without false positives.
 * MUST be tuned down once webcam test results are available.
 */
export const UNCERTAIN_DISTANCE_THRESHOLD = 0.35

/**
 * Minimum distance margin between first and second place for a confident match.
 * Initial value: 0.03 (half a typical intra-class distance).
 * If the two nearest mudras are this close, we report uncertain.
 * MUST be tuned against inter-class distances observed on webcam.
 */
export const UNCERTAIN_MARGIN = 0.03

/**
 * Z-axis contribution weight (0 = ignore z, 1 = full weight).
 * Set at 0.4 to partially suppress depth noise while retaining
 * structural information from the z channel.
 */
export const Z_WEIGHT = 0.4

// ─────────────────────────────────────────────────────────────────────────────
// Normalization
// ─────────────────────────────────────────────────────────────────────────────

type NormedPoint = { x: number; y: number; z: number }

/**
 * Normalizes 21 landmarks to wrist-relative, palm-scale space.
 * Step 1: subtract wrist (landmark 0) from all points.
 * Step 2: divide by wrist→middleMCP (landmark 0→9) distance.
 * Returns null if the hand is degenerate (palmScale < 1e-4).
 */
export function normalizeLandmarksForMatching(
  pts: { x: number; y: number; z: number }[],
): NormedPoint[] | null {
  if (!pts || pts.length !== 21) return null

  const wrist = pts[0]
  const mcp9 = pts[9]

  const palmScale = Math.hypot(
    mcp9.x - wrist.x,
    mcp9.y - wrist.y,
    (mcp9.z ?? 0) - (wrist.z ?? 0),
  )

  if (palmScale < 1e-4) return null

  return pts.map((p) => ({
    x: (p.x - wrist.x) / palmScale,
    y: (p.y - wrist.y) / palmScale,
    z: ((p.z ?? 0) - (wrist.z ?? 0)) / palmScale,
  }))
}

// ─────────────────────────────────────────────────────────────────────────────
// Distance
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mean per-landmark Euclidean distance between two normalized 21-point hands.
 * Z contribution is scaled by zWeight.
 */
export function meanLandmarkDistance(
  a: NormedPoint[],
  b: NormedPoint[],
  zWeight: number = Z_WEIGHT,
): number {
  let total = 0
  for (let i = 0; i < 21; i++) {
    const dx = a[i].x - b[i].x
    const dy = a[i].y - b[i].y
    const dz = (a[i].z - b[i].z) * zWeight
    total += Math.hypot(dx, dy, dz)
  }
  return total / 21
}

// ─────────────────────────────────────────────────────────────────────────────
// Matching Engine
// ─────────────────────────────────────────────────────────────────────────────

/** Group reference samples by mudra label for efficient lookup */
function groupSamplesByMudra(
  samples: ReferenceSample[],
): Map<MudraId, { sample: ReferenceSample; index: number }[]> {
  const map = new Map<MudraId, { sample: ReferenceSample; index: number }[]>()
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]
    if (!map.has(s.label)) map.set(s.label, [])
    map.get(s.label)!.push({ sample: s, index: i })
  }
  return map
}

const GROUPED_SAMPLES = groupSamplesByMudra(MUDRA_REFERENCE_SAMPLES)

const ALL_MUDRA_IDS: MudraId[] = [
  'musti', 'pataka', 'alapadma', 'suchi', 'shikhara',
  'ardhachandra', 'tripataka', 'ardhapataka', 'mayura', 'mukula',
]

/**
 * Runs reference-based matching against all supplied samples.
 *
 * @param rawLandmarks - 21 MediaPipe landmarks from the live webcam (in raw
 *   normalized-image-space from MediaPipe, NOT pre-transformed).
 * @param zWeight - optional z-axis contribution weight (default: Z_WEIGHT).
 * @returns RefMatchResult with ranked candidates and uncertainty state.
 */
export function matchAgainstReferences(
  rawLandmarks: NormalizedLandmark[] | null | undefined,
  zWeight: number = Z_WEIGHT,
): RefMatchResult {
  const thresholds = {
    uncertainDistanceThreshold: UNCERTAIN_DISTANCE_THRESHOLD,
    uncertainMargin: UNCERTAIN_MARGIN,
    zWeight,
  }

  if (!rawLandmarks || rawLandmarks.length !== 21) {
    return {
      status: 'no_hand',
      topCandidate: null,
      runnerUp: null,
      margin: null,
      candidates: [],
      unsupportedMudras: ALL_MUDRA_IDS.filter((id) => !GROUPED_SAMPLES.has(id)),
      thresholds,
    }
  }

  // Validate that all coordinates are finite
  for (const p of rawLandmarks) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z ?? 0)) {
      return {
        status: 'no_hand',
        topCandidate: null,
        runnerUp: null,
        margin: null,
        candidates: [],
        unsupportedMudras: ALL_MUDRA_IDS.filter((id) => !GROUPED_SAMPLES.has(id)),
        thresholds,
      }
    }
  }

  // Check hand bounding box for size and border distance
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (let i = 0; i < 21; i++) {
    const p = rawLandmarks[i]
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  const bbSpan = Math.max(maxX - minX, maxY - minY)
  const isTooSmall = bbSpan < 0.08
  const isNearEdge = minX <= 0.015 || maxX >= 0.985 || minY <= 0.015 || maxY >= 0.985

  let qualityStatus: RefMatchResult['qualityStatus'] = 'optimal'
  if (isNearEdge) {
    qualityStatus = 'edge_truncated'
  } else if (isTooSmall) {
    qualityStatus = 'too_far'
  } else if (bbSpan < 0.15) {
    qualityStatus = 'acceptable'
  }

  const normedQuery = normalizeLandmarksForMatching(rawLandmarks)
  if (!normedQuery) {
    return {
      status: 'uncertain',
      topCandidate: null,
      runnerUp: null,
      margin: null,
      candidates: [],
      unsupportedMudras: ALL_MUDRA_IDS.filter((id) => !GROUPED_SAMPLES.has(id)),
      qualityStatus,
      reason: 'Landmarks degenerate or palm scale too small',
      thresholds,
    }
  }

  // Bilateral reflection query for left/right hand invariance
  const mirroredQuery: NormedPoint[] = normedQuery.map((p) => ({
    x: -p.x,
    y: p.y,
    z: p.z,
  }))

  const unsupportedMudras: MudraId[] = []
  const candidates: RefMatchCandidate[] = []
  let bestGlobalOrientation: 'direct' | 'mirrored' = 'direct'

  for (const mudraId of ALL_MUDRA_IDS) {
    const entries = GROUPED_SAMPLES.get(mudraId)
    if (!entries || entries.length === 0) {
      unsupportedMudras.push(mudraId)
      continue
    }

    // Find nearest sample within this mudra class with bilateral orientation check
    let bestDist = Infinity
    let bestSampleIndex = 0
    let bestOrientation: 'direct' | 'mirrored' = 'direct'

    for (const entry of entries) {
      const normedRef = normalizeLandmarksForMatching(entry.sample.landmarks)
      if (!normedRef) continue

      const dDirect = meanLandmarkDistance(normedQuery, normedRef, zWeight)
      const dMirrored = meanLandmarkDistance(mirroredQuery, normedRef, zWeight)
      const d = Math.min(dDirect, dMirrored)
      const orientation: 'direct' | 'mirrored' = dDirect <= dMirrored ? 'direct' : 'mirrored'

      if (d < bestDist) {
        bestDist = d
        bestSampleIndex = entry.index
        bestOrientation = orientation
      }
    }

    if (Number.isFinite(bestDist)) {
      candidates.push({
        mudra: mudraId,
        meanDist: bestDist,
        nearestSampleIndex: bestSampleIndex,
        hasSamples: true,
      })
      if (candidates.length === 1 || bestDist < candidates[0].meanDist) {
        bestGlobalOrientation = bestOrientation
      }
    }
  }

  // Sort ascending by meanDist
  candidates.sort((a, b) => a.meanDist - b.meanDist)

  const topCandidate = candidates[0] ?? null
  const runnerUp = candidates[1] ?? null
  const margin = topCandidate && runnerUp ? runnerUp.meanDist - topCandidate.meanDist : null

  // Determine match status and reason
  let status: RefMatchResult['status'] = 'uncertain'
  let reason: string | undefined

  if (isTooSmall) {
    status = 'uncertain'
    reason = 'Hand is too far — move hand closer to camera'
  } else if (topCandidate) {
    const tooFar = topCandidate.meanDist > UNCERTAIN_DISTANCE_THRESHOLD
    const tooClose = margin !== null && margin < UNCERTAIN_MARGIN
    if (!tooFar && !tooClose) {
      status = 'matched'
    } else if (tooFar) {
      reason = `Distance to nearest mudra (${topCandidate.meanDist.toFixed(3)}) exceeds match threshold (${UNCERTAIN_DISTANCE_THRESHOLD})`
    } else if (tooClose) {
      reason = `Ambiguous match: margin between top candidates (${margin?.toFixed(3)}) is below ${UNCERTAIN_MARGIN}`
    }
  }

  return {
    status,
    topCandidate,
    runnerUp,
    margin,
    candidates,
    unsupportedMudras,
    matchedOrientation: bestGlobalOrientation,
    qualityStatus,
    reason,
    thresholds,
  }
}
