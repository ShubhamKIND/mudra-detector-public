import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MUDRA_REFERENCE_SAMPLES,
  validateReferenceSamples,
} from '../lib/mudra-reference-data.ts'
import {
  matchAgainstReferences,
  normalizeLandmarksForMatching,
  meanLandmarkDistance,
  UNCERTAIN_DISTANCE_THRESHOLD,
  UNCERTAIN_MARGIN,
} from '../lib/mudra-reference-matcher.ts'
import { MudraEngine } from '../lib/mudra-engine.ts'

test('1. Exact reference sample count and labels', () => {
  // Exactly 12 samples: 2 samples for each of the 6 supplied mudras
  assert.equal(MUDRA_REFERENCE_SAMPLES.length, 12)

  const counts = {}
  for (const s of MUDRA_REFERENCE_SAMPLES) {
    counts[s.label] = (counts[s.label] || 0) + 1
  }

  const expectedLabels = ['alapadma', 'ardhachandra', 'tripataka', 'mukula', 'pataka', 'mayura']
  for (const label of expectedLabels) {
    assert.equal(counts[label], 2, `Expected exactly 2 samples for ${label}`)
  }

  // The remaining four mudras must NOT have supplied samples in this dataset
  const unsupported = ['musti', 'suchi', 'shikhara', 'ardhapataka']
  for (const label of unsupported) {
    assert.equal(counts[label], undefined, `${label} should retain existing reference definitions`)
  }
})

test('2. Exactly 21 finite landmarks per sample with wrist at origin', () => {
  // Validator does not throw on dataset
  assert.doesNotThrow(() => validateReferenceSamples(MUDRA_REFERENCE_SAMPLES))

  for (let i = 0; i < MUDRA_REFERENCE_SAMPLES.length; i++) {
    const s = MUDRA_REFERENCE_SAMPLES[i]
    assert.equal(s.landmarks.length, 21, `Sample ${i} (${s.label}) must have 21 landmarks`)

    // Wrist (index 0) must be exactly at (0.0, 0.0, 0.0)
    assert.equal(s.landmarks[0].x, 0.0)
    assert.equal(s.landmarks[0].y, 0.0)
    assert.equal(s.landmarks[0].z, 0.0)

    for (let j = 0; j < 21; j++) {
      const p = s.landmarks[j]
      assert.ok(Number.isFinite(p.x), `Sample ${i} lm ${j} x must be finite`)
      assert.ok(Number.isFinite(p.y), `Sample ${i} lm ${j} y must be finite`)
      assert.ok(Number.isFinite(p.z), `Sample ${i} lm ${j} z must be finite`)
    }
  }
})

test('3. MediaPipe landmark ordering integrity', () => {
  // In MediaPipe: 0=wrist, 5=index MCP, 8=index TIP, 9=middle MCP, 12=middle TIP, 17=pinky MCP, 20=pinky TIP
  for (const s of MUDRA_REFERENCE_SAMPLES) {
    const wrist = s.landmarks[0]
    const middleMcp = s.landmarks[9]
    const middleTip = s.landmarks[12]

    const distMcp = Math.hypot(middleMcp.x - wrist.x, middleMcp.y - wrist.y, middleMcp.z - wrist.z)
    const distTip = Math.hypot(middleTip.x - wrist.x, middleTip.y - wrist.y, middleTip.z - wrist.z)

    // Middle MCP must be at a positive distance from wrist (> 0.3)
    assert.ok(distMcp > 0.3, `Palm scale for ${s.label} should be substantial`)
    // Middle tip must be further from wrist than middle MCP
    assert.ok(distTip > distMcp, `Middle tip must extend beyond middle MCP for ${s.label}`)
  }
})

test('4. Coordinate normalization to wrist origin and unit palm scale', () => {
  const sample = MUDRA_REFERENCE_SAMPLES[8] // Pataka sample 1
  const normed = normalizeLandmarksForMatching(sample.landmarks)

  assert.ok(normed)
  assert.equal(normed.length, 21)

  // Wrist is normalized to (0, 0, 0)
  assert.equal(normed[0].x, 0)
  assert.equal(normed[0].y, 0)
  assert.equal(normed[0].z, 0)

  // Distance from Wrist (0) to Middle MCP (9) is normalized to exactly 1.0
  const palmDist = Math.hypot(normed[9].x - normed[0].x, normed[9].y - normed[0].y, normed[9].z - normed[0].z)
  assert.ok(Math.abs(palmDist - 1.0) < 1e-6, `Normalized palm scale must be 1.0, got ${palmDist}`)

  // Degenerate inputs return null safely
  assert.equal(normalizeLandmarksForMatching(null), null)
  assert.equal(normalizeLandmarksForMatching([]), null)
  const degenerate = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }))
  assert.equal(normalizeLandmarksForMatching(degenerate), null)
})

test('5. Identical reference-to-reference matching yields distance 0', () => {
  for (const s of MUDRA_REFERENCE_SAMPLES) {
    const res = matchAgainstReferences(s.landmarks)
    assert.equal(res.status, 'matched')
    assert.ok(res.topCandidate)
    assert.equal(res.topCandidate.mudra, s.label)
    assert.ok(res.topCandidate.meanDist < 1e-6, `Self distance should be ~0, got ${res.topCandidate.meanDist}`)
  }
})

test('6. Similarity ranking matches across pairs of supplied samples', () => {
  // Test each supplied mudra: query with sample 0, ensure sample 1 of the same mudra ranks #1
  const mudraIndices = {
    alapadma: 0,
    ardhachandra: 2,
    tripataka: 4,
    mukula: 6,
    pataka: 8,
    mayura: 10,
  }

  for (const [mudra, idx] of Object.entries(mudraIndices)) {
    const sample0 = MUDRA_REFERENCE_SAMPLES[idx]
    const sample1 = MUDRA_REFERENCE_SAMPLES[idx + 1]

    // Distance between sample 0 and sample 1 of same mudra is small (< 0.08)
    const normed0 = normalizeLandmarksForMatching(sample0.landmarks)
    const normed1 = normalizeLandmarksForMatching(sample1.landmarks)
    const intraDist = meanLandmarkDistance(normed0, normed1)
    assert.ok(intraDist < 0.08, `Intra-class distance for ${mudra} should be < 0.08, got ${intraDist}`)

    // Querying with sample 1 correctly identifies mudra as top candidate
    const res = matchAgainstReferences(sample1.landmarks)
    assert.equal(res.status, 'matched')
    assert.equal(res.topCandidate?.mudra, mudra)
  }
})

test('7. Missing hand and ambiguous inputs return uncertain/no_hand', () => {
  // Missing or empty hand
  const noHandRes = matchAgainstReferences(null)
  assert.equal(noHandRes.status, 'no_hand')
  assert.equal(noHandRes.topCandidate, null)

  const emptyRes = matchAgainstReferences([])
  assert.equal(emptyRes.status, 'no_hand')

  // Unrelated random points far away from canonical poses
  const randomPts = Array.from({ length: 21 }, (_, i) => ({
    x: 0.5 + Math.sin(i * 10) * 5,
    y: 0.5 + Math.cos(i * 10) * 5,
    z: 10,
  }))
  const farRes = matchAgainstReferences(randomPts)
  assert.equal(farRes.status, 'uncertain')
  if (farRes.topCandidate) {
    assert.ok(farRes.topCandidate.meanDist > UNCERTAIN_DISTANCE_THRESHOLD)
  }
})

test('8. Existing rule engine behavior and stabilization remain intact', () => {
  const engine = new MudraEngine({ windowSize: 6, consensusThreshold: 4 })

  // Synthetic pataka hand
  const hand = []
  hand[0] = { x: 0.5, y: 0.8, z: 0 }
  hand[1] = { x: 0.44, y: 0.74, z: 0 }; hand[2] = { x: 0.4, y: 0.67, z: 0 }; hand[3] = { x: 0.38, y: 0.61, z: 0 }; hand[4] = { x: 0.41, y: 0.57, z: 0 }
  hand[5] = { x: 0.44, y: 0.55, z: 0 }; hand[6] = { x: 0.44, y: 0.45, z: 0 }; hand[7] = { x: 0.44, y: 0.37, z: 0 }; hand[8] = { x: 0.44, y: 0.3, z: 0 }
  hand[9] = { x: 0.5, y: 0.54, z: 0 }; hand[10] = { x: 0.5, y: 0.43, z: 0 }; hand[11] = { x: 0.5, y: 0.34, z: 0 }; hand[12] = { x: 0.5, y: 0.27, z: 0 }
  hand[13] = { x: 0.56, y: 0.55, z: 0 }; hand[14] = { x: 0.56, y: 0.45, z: 0 }; hand[15] = { x: 0.56, y: 0.37, z: 0 }; hand[16] = { x: 0.56, y: 0.3, z: 0 }
  hand[17] = { x: 0.61, y: 0.58, z: 0 }; hand[18] = { x: 0.61, y: 0.5, z: 0 }; hand[19] = { x: 0.61, y: 0.43, z: 0 }; hand[20] = { x: 0.61, y: 0.37, z: 0 }

  const out = engine.processFrame(hand)
  // Geometric rule engine result
  assert.equal(out.raw.status, 'recognized')
  assert.equal(out.raw.mudra, 'pataka')

  // Experimental reference matcher result is also present
  assert.ok(out.diagnostics.refMatch)
  assert.ok(Array.isArray(out.diagnostics.refMatch.candidates))

  // Null frame transitions safely
  const nullOut = engine.processFrame(null)
  assert.equal(nullOut.raw.status, 'no_hand')
  assert.equal(nullOut.stabilized.status, 'no_hand')
  assert.equal(nullOut.diagnostics.refMatch.status, 'no_hand')
})
