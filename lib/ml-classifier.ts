/**
 * ml-classifier.ts
 *
 * Phase 7A — Experimental ML Classifier for Mudra Recognition
 *
 * This module implements THREE lightweight classifiers that run entirely in the
 * browser / Node.js without any external ML library:
 *
 * 1. KNearestNeighbour — k-NN using per-landmark Euclidean distance in
 *    wrist-relative, palm-scale normalized space (same normalization as
 *    the reference matcher in Phase 5B).
 *
 * 2. WeightedKNN — k-NN with landmark-importance weights. Fingertip landmarks
 *    (4, 8, 12, 16, 20) contribute at 2× the base weight; wrist (0) contributes
 *    at 0 (always 0 after normalization). Useful for understanding which
 *    landmarks matter most.
 *
 * 3. NaiveBayesGaussian — Per-class Gaussian model on a 63-dimensional feature
 *    vector (21 landmarks × x/y/z). Class priors are learned from training data.
 *    This is the first parametric model in the project.
 *
 * All three are EXPERIMENTAL and not wired into the production pipeline.
 * They are evaluated via leave-one-out cross-validation (LOOCV) in
 * lib/ml-evaluation.ts.
 *
 * # Feature Space
 *
 * Both k-NN variants operate on the same 21-landmark normalized vector used by
 * the reference matcher:
 *   - Translate all landmarks so wrist (index 0) = (0, 0, 0).
 *   - Scale so that wrist → Middle MCP (index 9) distance = 1.
 *
 * The Naive Bayes variant flattens the same 63-dimensional vector but adds
 * bilateral reflection augmentation during training.
 *
 * # Production Safety
 *
 * - This module imports ONLY from the existing project.
 * - It does NOT modify any existing module.
 * - It does NOT replace the production rule engine or stabilizer.
 * - Results are only surfaced through ml-evaluation.ts (developer script) and
 *   the optional calibration panel integration.
 */

import { MUDRA_REFERENCE_SAMPLES } from './mudra-reference-data.ts'
import {
  normalizeLandmarksForMatching,
  meanLandmarkDistance,
  Z_WEIGHT,
} from './mudra-reference-matcher.ts'
import type { MudraId } from './mudras.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Shared Types
// ─────────────────────────────────────────────────────────────────────────────

export type Landmark3 = { x: number; y: number; z: number }

export type TrainingSample = {
  label: MudraId
  landmarks: Landmark3[]
  normalized?: Landmark3[] | null
}

export type ClassifierPrediction = {
  label: MudraId | null
  confidence: number       // 0.0–1.0, higher = more certain
  distances: { label: MudraId; distance: number }[]
  method: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Landmark importance weights for WeightedKNN
// MediaPipe landmark index → weight factor
// ─────────────────────────────────────────────────────────────────────────────

/** Fingertip landmarks: thumb (4), index (8), middle (12), ring (16), pinky (20) */
const FINGERTIP_INDICES = new Set([4, 8, 12, 16, 20])

/** MCP (knuckle) landmarks */
const MCP_INDICES = new Set([5, 9, 13, 17])

/** Wrist — always 0 after normalization, contributes nothing */
const WRIST_INDEX = 0

function landmarkWeight(index: number): number {
  if (index === WRIST_INDEX) return 0.0  // origin after normalization
  if (FINGERTIP_INDICES.has(index)) return 2.0  // most discriminative
  if (MCP_INDICES.has(index)) return 0.8  // structural
  return 1.0  // default
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalization utility
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalizes 21 raw landmarks to wrist-relative, unit-palm-scale space.
 * Returns null if the hand is degenerate.
 * Delegates to the shared reference matcher function for exact parity.
 */
export function normalizeForML(landmarks: Landmark3[]): Landmark3[] | null {
  return normalizeLandmarksForMatching(landmarks) as Landmark3[] | null
}

/** Flatten 21 normalized 3D landmarks into a 63-dim feature vector. */
export function flattenLandmarks(pts: Landmark3[]): number[] {
  const v: number[] = new Array(63)
  for (let i = 0; i < 21; i++) {
    v[i * 3] = pts[i].x
    v[i * 3 + 1] = pts[i].y
    v[i * 3 + 2] = pts[i].z
  }
  return v
}

/** Mirror (bilateral reflection) of a normalized landmark set: x → -x. */
export function mirrorLandmarks(pts: Landmark3[]): Landmark3[] {
  return pts.map((p) => ({ x: -p.x, y: p.y, z: p.z }))
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. K-Nearest Neighbour Classifier
// ─────────────────────────────────────────────────────────────────────────────

export class KNearestNeighbour {
  readonly k: number
  readonly zWeight: number
  readonly name: string

  protected trainingData: { label: MudraId; normed: Landmark3[] }[] = []

  constructor(k = 1, zWeight = Z_WEIGHT, name?: string) {
    this.k = k
    this.zWeight = zWeight
    this.name = name ?? `KNN(k=${k})`
  }

  /**
   * Trains the classifier on a set of samples.
   * Optional bilateral augmentation: each sample is also mirrored for left-hand parity.
   */
  fit(samples: TrainingSample[], augmentBilateral = true): this {
    this.trainingData = []
    for (const s of samples) {
      const normed = s.normalized ?? normalizeForML(s.landmarks)
      if (!normed) continue
      this.trainingData.push({ label: s.label, normed })
      if (augmentBilateral) {
        this.trainingData.push({ label: s.label, normed: mirrorLandmarks(normed) })
      }
    }
    return this
  }

  /** Predict class for a query sample. */
  predict(query: Landmark3[]): ClassifierPrediction {
    const normedQuery = normalizeForML(query)
    if (!normedQuery || this.trainingData.length === 0) {
      return { label: null, confidence: 0, distances: [], method: this.name }
    }

    // Compute distance to every training point
    const dists = this.trainingData.map((t) => ({
      label: t.label,
      distance: meanLandmarkDistance(normedQuery, t.normed, this.zWeight),
    }))

    dists.sort((a, b) => a.distance - b.distance)

    const kNearest = dists.slice(0, this.k)

    // Majority vote among k nearest
    const votes: Record<string, number> = {}
    for (const d of kNearest) {
      votes[d.label] = (votes[d.label] ?? 0) + 1
    }

    const winner = Object.entries(votes).sort((a, b) => b[1] - a[1])[0]
    const winnerLabel = winner[0] as MudraId
    const confidence = winner[1] / this.k

    // Aggregate per-class minimum distance for display
    const perClass: Record<string, number> = {}
    for (const d of dists) {
      if (!(d.label in perClass) || d.distance < perClass[d.label]) {
        perClass[d.label] = d.distance
      }
    }
    const classDists = Object.entries(perClass)
      .map(([label, distance]) => ({ label: label as MudraId, distance }))
      .sort((a, b) => a.distance - b.distance)

    return {
      label: winnerLabel,
      confidence,
      distances: classDists,
      method: `${this.name}(k=${this.k})`,
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Weighted K-NN (landmark-importance weighted distance)
// ─────────────────────────────────────────────────────────────────────────────

export class WeightedKNN extends KNearestNeighbour {
  constructor(k = 1, zWeight = Z_WEIGHT) {
    super(k, zWeight, `WeightedKNN(k=${k})`)
  }

  /** Weighted per-landmark distance. Fingertips count 2×. */
  private weightedDistance(a: Landmark3[], b: Landmark3[]): number {
    let total = 0
    let weightSum = 0
    for (let i = 0; i < 21; i++) {
      const w = landmarkWeight(i)
      if (w === 0) continue
      const dx = a[i].x - b[i].x
      const dy = a[i].y - b[i].y
      const dz = (a[i].z - b[i].z) * this.zWeight
      total += w * Math.hypot(dx, dy, dz)
      weightSum += w
    }
    return weightSum > 0 ? total / weightSum : Infinity
  }

  override predict(query: Landmark3[]): ClassifierPrediction {
    const normedQuery = normalizeForML(query)
    if (!normedQuery || this.trainingData.length === 0) {
      return { label: null, confidence: 0, distances: [], method: this.name }
    }

    const dists = this.trainingData.map((t) => ({
      label: t.label,
      distance: this.weightedDistance(normedQuery, t.normed),
    }))

    dists.sort((a, b) => a.distance - b.distance)
    const kNearest = dists.slice(0, this.k)

    const votes: Record<string, number> = {}
    for (const d of kNearest) {
      votes[d.label] = (votes[d.label] ?? 0) + 1
    }

    const winner = Object.entries(votes).sort((a, b) => b[1] - a[1])[0]
    const winnerLabel = winner[0] as MudraId
    const confidence = winner[1] / this.k

    const perClass: Record<string, number> = {}
    for (const d of dists) {
      if (!(d.label in perClass) || d.distance < perClass[d.label]) {
        perClass[d.label] = d.distance
      }
    }
    const classDists = Object.entries(perClass)
      .map(([label, distance]) => ({ label: label as MudraId, distance }))
      .sort((a, b) => a.distance - b.distance)

    return {
      label: winnerLabel,
      confidence,
      distances: classDists,
      method: this.name,
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Naive Bayes Gaussian Classifier (parametric, 63 dimensions)
// ─────────────────────────────────────────────────────────────────────────────

type GaussianModel = {
  label: MudraId
  mean: number[]
  variance: number[]
  logPrior: number
}

export class NaiveBayesGaussian {
  readonly name = 'NaiveBayesGaussian'
  private models: GaussianModel[] = []

  /**
   * Fit Gaussian parameters per class.
   * Uses bilateral augmentation (each sample + its mirror) to double effective N.
   */
  fit(samples: TrainingSample[], augmentBilateral = true): this {
    // Group by label
    const groups = new Map<MudraId, number[][]>()
    let totalSamples = 0

    for (const s of samples) {
      const normed = s.normalized ?? normalizeForML(s.landmarks)
      if (!normed) continue

      const vec = flattenLandmarks(normed)
      if (!groups.has(s.label)) groups.set(s.label, [])
      groups.get(s.label)!.push(vec)
      totalSamples++

      if (augmentBilateral) {
        const mirrored = mirrorLandmarks(normed)
        const mirVec = flattenLandmarks(mirrored)
        groups.get(s.label)!.push(mirVec)
        totalSamples++
      }
    }

    this.models = []

    for (const [label, vecs] of groups) {
      const n = vecs.length
      const dim = vecs[0].length

      // Compute per-dimension mean
      const mean = new Array<number>(dim).fill(0)
      for (const v of vecs) {
        for (let d = 0; d < dim; d++) mean[d] += v[d]
      }
      for (let d = 0; d < dim; d++) mean[d] /= n

      // Compute per-dimension variance (with Laplace smoothing floor of 1e-6)
      const variance = new Array<number>(dim).fill(0)
      for (const v of vecs) {
        for (let d = 0; d < dim; d++) {
          variance[d] += (v[d] - mean[d]) ** 2
        }
      }
      for (let d = 0; d < dim; d++) {
        variance[d] = Math.max(variance[d] / n, 1e-6)
      }

      const logPrior = Math.log(n / totalSamples)

      this.models.push({ label, mean, variance, logPrior })
    }

    return this
  }

  /** Gaussian log-likelihood for a vector given a model. */
  private logLikelihood(vec: number[], model: GaussianModel): number {
    let ll = 0
    for (let d = 0; d < vec.length; d++) {
      const diff = vec[d] - model.mean[d]
      ll -= 0.5 * Math.log(2 * Math.PI * model.variance[d])
      ll -= (diff * diff) / (2 * model.variance[d])
    }
    return ll
  }

  predict(query: Landmark3[]): ClassifierPrediction {
    if (this.models.length === 0) {
      return { label: null, confidence: 0, distances: [], method: this.name }
    }

    const normedQuery = normalizeForML(query)
    if (!normedQuery) {
      return { label: null, confidence: 0, distances: [], method: this.name }
    }

    const vec = flattenLandmarks(normedQuery)

    // Compute log posterior for each class
    const scores = this.models.map((m) => ({
      label: m.label,
      logScore: this.logLikelihood(vec, m) + m.logPrior,
    }))

    scores.sort((a, b) => b.logScore - a.logScore)

    // Softmax to convert log-scores to probabilities for confidence display
    const maxLog = scores[0].logScore
    const expScores = scores.map((s) => Math.exp(s.logScore - maxLog))
    const sumExp = expScores.reduce((a, b) => a + b, 0)
    const probs = expScores.map((e, i) => ({
      label: scores[i].label,
      prob: e / sumExp,
    }))

    return {
      label: scores[0].label,
      confidence: Number(probs[0].prob.toFixed(4)),
      distances: probs.map((p) => ({ label: p.label, distance: 1 - p.prob })),
      method: this.name,
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Dataset Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts the hardcoded Phase 5B reference samples to TrainingSample format.
 * This is the primary training data available without any user data collection.
 */
export function getBuiltinTrainingSamples(): TrainingSample[] {
  return MUDRA_REFERENCE_SAMPLES.map((s) => ({
    label: s.label,
    landmarks: s.landmarks as Landmark3[],
    normalized: normalizeLandmarksForMatching(s.landmarks) as Landmark3[] | null,
  }))
}

/**
 * Counts samples per class in a dataset.
 */
export function countPerClass(samples: TrainingSample[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const s of samples) {
    counts[s.label] = (counts[s.label] ?? 0) + 1
  }
  return counts
}
