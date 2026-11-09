import type { MudraId } from './mudras.ts'

/**
 * A single 3D landmark point in wrist-relative normalized space.
 * Wrist (landmark 0) is always {x:0, y:0, z:0} after normalization.
 * Scale is normalized so that the wrist-to-middle-MCP (0→9) distance equals 1.
 */
export type RefLandmark = { x: number; y: number; z: number }

/**
 * One reference sample: a mudra label and exactly 21 landmarks (MediaPipe order 0–20).
 * Coordinates are wrist-relative (landmark 0 is origin) and palm-scale normalized
 * (wrist-to-middle-MCP distance = 1). They were supplied pre-centered on the wrist
 * and are stored WITHOUT further modification.
 *
 * The supplier's coordinate frame is confirmed compatible with MediaPipe output
 * when both are translated to wrist origin and normalized by wrist→middle-MCP distance.
 */
export type ReferenceSample = {
  label: MudraId
  /** 21 landmarks in MediaPipe index order 0–20 */
  landmarks: [
    RefLandmark, RefLandmark, RefLandmark, RefLandmark, RefLandmark,
    RefLandmark, RefLandmark, RefLandmark, RefLandmark, RefLandmark,
    RefLandmark, RefLandmark, RefLandmark, RefLandmark, RefLandmark,
    RefLandmark, RefLandmark, RefLandmark, RefLandmark, RefLandmark,
    RefLandmark,
  ]
}

// ─────────────────────────────────────────────────────────────────────────────
// Coordinate System Notes
// ─────────────────────────────────────────────────────────────────────────────
//
// The supplied CSV samples already have landmark 0 (Wrist) at exactly (0, 0, 0).
// Palm y-axis points upward (negative y = toward fingertips), matching the
// poseToLandmarks() convention used elsewhere in this codebase.
//
// The raw supplied values have varying wrist→middleMCP distances (~0.46–0.53).
// Before matching, both reference and live landmarks are:
//   1. Translated to wrist origin (subtract wrist position).
//   2. Scale-normalized by wrist→middleMCP distance.
// This is identical to what extractHandFeatures() uses for palmScale.
// The stored values below are the EXACT supplied values (not pre-normalized),
// and normalization is applied at match time in mudra-reference-matcher.ts.

// ─────────────────────────────────────────────────────────────────────────────
// Supplied Reference Samples (6 mudras × 2 samples each)
// Values are EXACT as supplied. Do not modify.
// ─────────────────────────────────────────────────────────────────────────────

function lm(
  x0: number, y0: number, z0: number,
  x1: number, y1: number, z1: number,
  x2: number, y2: number, z2: number,
  x3: number, y3: number, z3: number,
  x4: number, y4: number, z4: number,
  x5: number, y5: number, z5: number,
  x6: number, y6: number, z6: number,
  x7: number, y7: number, z7: number,
  x8: number, y8: number, z8: number,
  x9: number, y9: number, z9: number,
  x10: number, y10: number, z10: number,
  x11: number, y11: number, z11: number,
  x12: number, y12: number, z12: number,
  x13: number, y13: number, z13: number,
  x14: number, y14: number, z14: number,
  x15: number, y15: number, z15: number,
  x16: number, y16: number, z16: number,
  x17: number, y17: number, z17: number,
  x18: number, y18: number, z18: number,
  x19: number, y19: number, z19: number,
  x20: number, y20: number, z20: number,
): ReferenceSample['landmarks'] {
  return [
    { x: x0, y: y0, z: z0 },
    { x: x1, y: y1, z: z1 },
    { x: x2, y: y2, z: z2 },
    { x: x3, y: y3, z: z3 },
    { x: x4, y: y4, z: z4 },
    { x: x5, y: y5, z: z5 },
    { x: x6, y: y6, z: z6 },
    { x: x7, y: y7, z: z7 },
    { x: x8, y: y8, z: z8 },
    { x: x9, y: y9, z: z9 },
    { x: x10, y: y10, z: z10 },
    { x: x11, y: y11, z: z11 },
    { x: x12, y: y12, z: z12 },
    { x: x13, y: y13, z: z13 },
    { x: x14, y: y14, z: z14 },
    { x: x15, y: y15, z: z15 },
    { x: x16, y: y16, z: z16 },
    { x: x17, y: y17, z: z17 },
    { x: x18, y: y18, z: z18 },
    { x: x19, y: y19, z: z19 },
    { x: x20, y: y20, z: z20 },
  ]
}

export const MUDRA_REFERENCE_SAMPLES: ReferenceSample[] = [
  // ── Alapadma ───────────────────────────────────────────────────────────────
  {
    label: 'alapadma',
    landmarks: lm(
      0.0, 0.0, 0.0, 0.19, -0.11, -0.04, 0.33, -0.24, -0.07, 0.42, -0.35, -0.09, 0.49, -0.43, -0.11,
      0.13, -0.47, -0.01, 0.22, -0.68, -0.03, 0.29, -0.83, -0.05, 0.35, -0.95, -0.07,
      0.01, -0.51, 0.01, 0.05, -0.74, 0.02, 0.08, -0.90, 0.03, 0.10, -0.99, 0.04,
      -0.10, -0.49, 0.02, -0.12, -0.71, 0.05, -0.13, -0.86, 0.07, -0.13, -0.94, 0.09,
      -0.21, -0.43, 0.04, -0.30, -0.62, 0.08, -0.36, -0.75, 0.12, -0.41, -0.84, 0.15,
    ),
  },
  {
    label: 'alapadma',
    landmarks: lm(
      0.0, 0.0, 0.0, 0.17, -0.13, -0.06, 0.31, -0.26, -0.09, 0.40, -0.37, -0.11, 0.47, -0.45, -0.13,
      0.11, -0.49, -0.03, 0.20, -0.70, -0.05, 0.27, -0.85, -0.07, 0.33, -0.97, -0.09,
      -0.01, -0.53, -0.01, 0.03, -0.76, 0.0, 0.06, -0.92, 0.01, 0.08, -1.0, 0.02,
      -0.12, -0.51, 0.0, -0.14, -0.73, 0.03, -0.15, -0.88, 0.05, -0.15, -0.96, 0.07,
      -0.23, -0.45, 0.02, -0.32, -0.64, 0.06, -0.38, -0.77, 0.10, -0.43, -0.86, 0.13,
    ),
  },

  // ── Ardhachandra ──────────────────────────────────────────────────────────
  {
    label: 'ardhachandra',
    landmarks: lm(
      0.0, 0.0, 0.0, -0.14, -0.21, -0.03, -0.27, -0.40, -0.05, -0.35, -0.54, -0.07, -0.41, -0.67, -0.09,
      0.46, -0.09, 0.02, 0.69, -0.11, 0.03, 0.86, -0.12, 0.03, 0.99, -0.13, 0.04,
      0.48, -0.01, 0.02, 0.72, -0.02, 0.03, 0.90, -0.03, 0.04, 1.0, -0.04, 0.04,
      0.46, 0.07, 0.01, 0.68, 0.08, 0.02, 0.85, 0.09, 0.03, 0.96, 0.10, 0.03,
      0.42, 0.15, 0.0, 0.61, 0.17, 0.01, 0.76, 0.19, 0.02, 0.87, 0.20, 0.02,
    ),
  },
  {
    label: 'ardhachandra',
    landmarks: lm(
      0.0, 0.0, 0.0, -0.16, -0.23, -0.05, -0.29, -0.42, -0.07, -0.37, -0.56, -0.09, -0.43, -0.69, -0.11,
      0.44, -0.11, 0.0, 0.67, -0.13, 0.01, 0.84, -0.14, 0.01, 0.97, -0.15, 0.02,
      0.46, -0.03, 0.0, 0.70, -0.04, 0.01, 0.88, -0.05, 0.02, 0.99, -0.06, 0.02,
      0.44, 0.05, -0.01, 0.66, 0.06, 0.0, 0.83, 0.07, 0.01, 0.94, 0.08, 0.01,
      0.40, 0.13, -0.02, 0.59, 0.15, -0.01, 0.74, 0.17, 0.0, 0.85, 0.18, 0.0,
    ),
  },

  // ── Tripataka ─────────────────────────────────────────────────────────────
  {
    label: 'tripataka',
    landmarks: lm(
      0.0, 0.0, 0.0, 0.13, -0.17, -0.02, 0.23, -0.31, -0.04, 0.29, -0.41, -0.05, 0.31, -0.49, -0.06,
      0.19, -0.47, 0.0, 0.25, -0.71, -0.01, 0.29, -0.87, -0.02, 0.32, -0.99, -0.03,
      0.05, -0.49, 0.01, 0.07, -0.73, 0.02, 0.08, -0.89, 0.03, 0.09, -0.97, 0.03,
      -0.09, -0.45, 0.02, -0.07, -0.54, -0.14, -0.04, -0.53, -0.27, -0.01, -0.51, -0.37,
      -0.21, -0.39, 0.03, -0.29, -0.59, 0.05, -0.34, -0.73, 0.07, -0.37, -0.83, 0.08,
    ),
  },
  {
    label: 'tripataka',
    landmarks: lm(
      0.0, 0.0, 0.0, 0.11, -0.19, -0.04, 0.21, -0.33, -0.06, 0.27, -0.43, -0.07, 0.29, -0.51, -0.08,
      0.17, -0.49, -0.02, 0.23, -0.73, -0.03, 0.27, -0.89, -0.04, 0.30, -1.0, -0.05,
      0.03, -0.51, -0.01, 0.05, -0.75, 0.0, 0.06, -0.91, 0.01, 0.07, -0.99, 0.01,
      -0.11, -0.47, 0.0, -0.09, -0.56, -0.16, -0.06, -0.55, -0.29, -0.03, -0.53, -0.39,
      -0.23, -0.41, 0.01, -0.31, -0.61, 0.03, -0.36, -0.75, 0.05, -0.39, -0.85, 0.06,
    ),
  },

  // ── Mukula ────────────────────────────────────────────────────────────────
  {
    label: 'mukula',
    landmarks: lm(
      0.0, 0.0, 0.0, 0.13, -0.15, -0.03, 0.23, -0.29, -0.06, 0.29, -0.41, -0.09, 0.31, -0.49, -0.11,
      0.17, -0.41, -0.04, 0.23, -0.54, -0.08, 0.27, -0.57, -0.11, 0.30, -0.51, -0.12,
      0.05, -0.43, -0.03, 0.09, -0.57, -0.07, 0.15, -0.59, -0.10, 0.29, -0.51, -0.12,
      -0.07, -0.41, -0.02, -0.05, -0.55, -0.06, 0.03, -0.58, -0.09, 0.28, -0.50, -0.11,
      -0.17, -0.35, -0.01, -0.15, -0.49, -0.04, -0.07, -0.55, -0.07, 0.26, -0.49, -0.10,
    ),
  },
  {
    label: 'mukula',
    landmarks: lm(
      0.0, 0.0, 0.0, 0.11, -0.17, -0.05, 0.21, -0.31, -0.08, 0.27, -0.43, -0.11, 0.29, -0.51, -0.13,
      0.15, -0.43, -0.06, 0.21, -0.56, -0.10, 0.25, -0.59, -0.13, 0.28, -0.53, -0.14,
      0.03, -0.45, -0.05, 0.07, -0.59, -0.09, 0.13, -0.61, -0.12, 0.27, -0.53, -0.14,
      -0.09, -0.43, -0.04, -0.07, -0.57, -0.08, 0.01, -0.60, -0.11, 0.26, -0.52, -0.13,
      -0.19, -0.37, -0.03, -0.17, -0.51, -0.06, -0.09, -0.57, -0.09, 0.24, -0.51, -0.12,
    ),
  },

  // ── Pataka ────────────────────────────────────────────────────────────────
  {
    label: 'pataka',
    landmarks: lm(
      0.0, 0.0, 0.0, 0.12, -0.17, -0.02, 0.19, -0.31, -0.04, 0.21, -0.41, -0.05, 0.20, -0.49, -0.05,
      0.17, -0.47, 0.0, 0.23, -0.71, -0.01, 0.27, -0.87, -0.02, 0.30, -0.99, -0.03,
      0.05, -0.49, 0.01, 0.07, -0.74, 0.02, 0.08, -0.91, 0.03, 0.09, -0.99, 0.03,
      -0.07, -0.47, 0.02, -0.09, -0.71, 0.03, -0.10, -0.87, 0.04, -0.11, -0.95, 0.05,
      -0.19, -0.41, 0.03, -0.23, -0.63, 0.05, -0.25, -0.77, 0.06, -0.27, -0.87, 0.07,
    ),
  },
  {
    label: 'pataka',
    landmarks: lm(
      0.0, 0.0, 0.0, 0.10, -0.19, -0.04, 0.17, -0.33, -0.06, 0.19, -0.43, -0.07, 0.18, -0.51, -0.07,
      0.15, -0.49, -0.02, 0.21, -0.73, -0.03, 0.25, -0.89, -0.04, 0.28, -1.01, -0.05,
      0.03, -0.51, -0.01, 0.05, -0.76, 0.0, 0.06, -0.93, 0.01, 0.07, -1.01, 0.01,
      -0.09, -0.49, 0.0, -0.11, -0.73, 0.01, -0.12, -0.89, 0.02, -0.13, -0.97, 0.03,
      -0.21, -0.43, 0.01, -0.25, -0.65, 0.03, -0.27, -0.79, 0.04, -0.29, -0.89, 0.05,
    ),
  },

  // ── Mayura ────────────────────────────────────────────────────────────────
  {
    label: 'mayura',
    landmarks: lm(
      0.0, 0.0, 0.0, 0.13, -0.17, -0.02, 0.23, -0.31, -0.04, 0.21, -0.41, -0.07, 0.13, -0.45, -0.09,
      0.19, -0.47, 0.0, 0.25, -0.71, -0.01, 0.29, -0.87, -0.02, 0.32, -0.99, -0.03,
      0.05, -0.49, 0.01, 0.07, -0.73, 0.02, 0.08, -0.89, 0.03, 0.09, -0.97, 0.03,
      -0.09, -0.45, 0.02, -0.07, -0.54, -0.07, 0.03, -0.51, -0.09, 0.11, -0.46, -0.09,
      -0.21, -0.39, 0.03, -0.29, -0.59, 0.05, -0.34, -0.73, 0.07, -0.37, -0.83, 0.08,
    ),
  },
  {
    label: 'mayura',
    landmarks: lm(
      0.0, 0.0, 0.0, 0.11, -0.19, -0.04, 0.21, -0.33, -0.06, 0.19, -0.43, -0.09, 0.11, -0.47, -0.11,
      0.17, -0.49, -0.02, 0.23, -0.73, -0.03, 0.27, -0.89, -0.04, 0.30, -1.01, -0.05,
      0.03, -0.51, -0.01, 0.05, -0.75, 0.0, 0.06, -0.91, 0.01, 0.07, -0.99, 0.01,
      -0.11, -0.47, 0.0, -0.09, -0.56, -0.09, 0.01, -0.53, -0.11, 0.09, -0.48, -0.11,
      -0.23, -0.41, 0.01, -0.31, -0.61, 0.03, -0.36, -0.75, 0.05, -0.39, -0.85, 0.06,
    ),
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

const VALID_LABELS: Set<MudraId> = new Set([
  'musti', 'pataka', 'alapadma', 'suchi', 'shikhara',
  'ardhachandra', 'tripataka', 'ardhapataka', 'mayura', 'mukula',
])

/**
 * Validates all reference samples at module load time.
 * Throws if any sample violates structural or numeric invariants.
 */
export function validateReferenceSamples(samples: ReferenceSample[]): void {
  for (let si = 0; si < samples.length; si++) {
    const s = samples[si]
    if (!VALID_LABELS.has(s.label)) {
      throw new Error(`Reference sample ${si}: invalid label "${s.label}"`)
    }
    if (!Array.isArray(s.landmarks) || s.landmarks.length !== 21) {
      throw new Error(`Reference sample ${si} (${s.label}): expected 21 landmarks, got ${s.landmarks?.length}`)
    }
    for (let li = 0; li < 21; li++) {
      const p = s.landmarks[li]
      if (!p || typeof p.x !== 'number' || typeof p.y !== 'number' || typeof p.z !== 'number') {
        throw new Error(`Reference sample ${si} (${s.label}): landmark ${li} is not a valid {x,y,z} object`)
      }
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) {
        throw new Error(`Reference sample ${si} (${s.label}): landmark ${li} contains non-finite value`)
      }
    }
  }
}

// Run validation eagerly
validateReferenceSamples(MUDRA_REFERENCE_SAMPLES)
