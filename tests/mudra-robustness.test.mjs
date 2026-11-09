import test from 'node:test'
import assert from 'node:assert/strict'
import {
  extractHandFeatures,
  computeHandMetrics,
} from '../lib/geometric-features.ts'
import {
  normalizeLandmarksForMatching,
  meanLandmarkDistance,
  matchAgainstReferences,
} from '../lib/mudra-reference-matcher.ts'
import {
  MUDRA_REFERENCE_SAMPLES,
} from '../lib/mudra-reference-data.ts'
import {
  createCollectedSample,
  validateCollectedSample,
  computeDatasetSummary,
  exportSamplesToCsv,
  exportSamplesToJson,
  importSamplesFromCsv,
  importSamplesFromJson,
} from '../lib/mudra-data-collection.ts'

// Helper to generate a realistic hand pose at a given offset (dx, dy) and scale
function createMockHandAt(dx = 0.5, dy = 0.5, scale = 1.0) {
  // Base coordinates relative to wrist (approx Pataka open hand)
  const baseLandmarks = [
    { x: 0.0, y: 0.0, z: 0.0 }, // 0: Wrist
    { x: 0.04, y: -0.04, z: -0.01 }, // 1: Thumb CMC
    { x: 0.07, y: -0.08, z: -0.02 }, // 2: Thumb MCP
    { x: 0.09, y: -0.12, z: -0.03 }, // 3: Thumb IP
    { x: 0.10, y: -0.16, z: -0.04 }, // 4: Thumb TIP
    { x: 0.03, y: -0.14, z: -0.01 }, // 5: Index MCP
    { x: 0.03, y: -0.20, z: -0.02 }, // 6: Index PIP
    { x: 0.03, y: -0.25, z: -0.03 }, // 7: Index DIP
    { x: 0.03, y: -0.30, z: -0.04 }, // 8: Index TIP
    { x: 0.00, y: -0.15, z: 0.00 }, // 9: Middle MCP
    { x: 0.00, y: -0.22, z: 0.00 }, // 10: Middle PIP
    { x: 0.00, y: -0.28, z: 0.00 }, // 11: Middle DIP
    { x: 0.00, y: -0.33, z: 0.00 }, // 12: Middle TIP
    { x: -0.03, y: -0.14, z: 0.01 }, // 13: Ring MCP
    { x: -0.03, y: -0.20, z: 0.02 }, // 14: Ring PIP
    { x: -0.03, y: -0.25, z: 0.03 }, // 15: Ring DIP
    { x: -0.03, y: -0.30, z: 0.04 }, // 16: Ring TIP
    { x: -0.06, y: -0.12, z: 0.02 }, // 17: Pinky MCP
    { x: -0.07, y: -0.17, z: 0.03 }, // 18: Pinky PIP
    { x: -0.08, y: -0.21, z: 0.04 }, // 19: Pinky DIP
    { x: -0.08, y: -0.25, z: 0.05 }, // 20: Pinky TIP
  ]

  return baseLandmarks.map((p) => ({
    x: dx + p.x * scale,
    y: dy + p.y * scale,
    z: p.z * scale,
  }))
}

test('1. Coordinate normalization at different frame positions', () => {
  const centerHand = createMockHandAt(0.5, 0.5, 1.0)
  const topLeftHand = createMockHandAt(0.15, 0.15, 1.0)
  const bottomRightHand = createMockHandAt(0.75, 0.75, 1.0)

  const normCenter = normalizeLandmarksForMatching(centerHand)
  const normTopLeft = normalizeLandmarksForMatching(topLeftHand)
  const normBottomRight = normalizeLandmarksForMatching(bottomRightHand)

  assert.ok(normCenter, 'Center hand should normalize')
  assert.ok(normTopLeft, 'Top-left hand should normalize')
  assert.ok(normBottomRight, 'Bottom-right hand should normalize')

  // Wrist is normalized to (0, 0, 0)
  assert.equal(normCenter[0].x, 0)
  assert.equal(normCenter[0].y, 0)
  assert.equal(normTopLeft[0].x, 0)
  assert.equal(normTopLeft[0].y, 0)
  assert.equal(normBottomRight[0].x, 0)
  assert.equal(normBottomRight[0].y, 0)

  // Landmarks across all three positions must match within float precision
  for (let i = 0; i < 21; i++) {
    assert.ok(
      Math.abs(normCenter[i].x - normTopLeft[i].x) < 1e-5,
      `Landmark ${i} x mismatch between center and top-left`
    )
    assert.ok(
      Math.abs(normCenter[i].y - normTopLeft[i].y) < 1e-5,
      `Landmark ${i} y mismatch between center and top-left`
    )
    assert.ok(
      Math.abs(normCenter[i].x - normBottomRight[i].x) < 1e-5,
      `Landmark ${i} x mismatch between center and bottom-right`
    )
    assert.ok(
      Math.abs(normCenter[i].y - normBottomRight[i].y) < 1e-5,
      `Landmark ${i} y mismatch between center and bottom-right`
    )
  }
})

test('2. Scale normalization at different hand sizes / distances', () => {
  const largeHand = createMockHandAt(0.5, 0.5, 1.6) // close to camera
  const mediumHand = createMockHandAt(0.5, 0.5, 1.0) // normal distance
  const smallHand = createMockHandAt(0.5, 0.5, 0.5) // farther away

  const normLarge = normalizeLandmarksForMatching(largeHand)
  const normMed = normalizeLandmarksForMatching(mediumHand)
  const normSmall = normalizeLandmarksForMatching(smallHand)

  assert.ok(normLarge && normMed && normSmall)

  for (let i = 0; i < 21; i++) {
    assert.ok(
      Math.abs(normLarge[i].x - normMed[i].x) < 1e-4,
      `Scale variance at landmark ${i} x between large and medium`
    )
    assert.ok(
      Math.abs(normLarge[i].y - normMed[i].y) < 1e-4,
      `Scale variance at landmark ${i} y between large and medium`
    )
    assert.ok(
      Math.abs(normMed[i].x - normSmall[i].x) < 1e-4,
      `Scale variance at landmark ${i} x between medium and small`
    )
    assert.ok(
      Math.abs(normMed[i].y - normSmall[i].y) < 1e-4,
      `Scale variance at landmark ${i} y between medium and small`
    )
  }
})

test('3. Similarity score consistency across positions in camera frame', () => {
  // Use a real reference sample (Pataka sample 0)
  const patakaRef = MUDRA_REFERENCE_SAMPLES.find((s) => s.label === 'pataka')
  assert.ok(patakaRef, 'Pataka reference must exist')

  // Recreate landmarks at different screen coordinates
  const patakaCenter = patakaRef.landmarks.map((p) => ({
    x: 0.5 + p.x * 0.2,
    y: 0.5 + p.y * 0.2,
    z: p.z * 0.2,
  }))
  const patakaCorner = patakaRef.landmarks.map((p) => ({
    x: 0.2 + p.x * 0.2,
    y: 0.2 + p.y * 0.2,
    z: p.z * 0.2,
  }))

  const matchCenter = matchAgainstReferences(patakaCenter)
  const matchCorner = matchAgainstReferences(patakaCorner)

  assert.equal(matchCenter.topCandidate?.mudra, 'pataka')
  assert.equal(matchCorner.topCandidate?.mudra, 'pataka')
  assert.ok(
    Math.abs(matchCenter.topCandidate.meanDist - matchCorner.topCandidate.meanDist) < 1e-4,
    `Distance discrepancy across frame positions: ${matchCenter.topCandidate.meanDist} vs ${matchCorner.topCandidate.meanDist}`
  )
})

test('4. Bilateral symmetry: matches mirrored pose for opposite hand', () => {
  const alapadmaRef = MUDRA_REFERENCE_SAMPLES.find((s) => s.label === 'alapadma')
  assert.ok(alapadmaRef, 'Alapadma reference must exist')

  // Direct right hand pose
  const directPose = alapadmaRef.landmarks.map((p) => ({
    x: 0.5 + p.x * 0.2,
    y: 0.5 + p.y * 0.2,
    z: p.z * 0.2,
  }))

  // Horizontally mirrored left hand pose (flip x around wrist)
  const mirroredPose = alapadmaRef.landmarks.map((p) => ({
    x: 0.5 - p.x * 0.2,
    y: 0.5 + p.y * 0.2,
    z: p.z * 0.2,
  }))

  const directMatch = matchAgainstReferences(directPose)
  const mirroredMatch = matchAgainstReferences(mirroredPose)

  // Direct should match as 'direct' orientation
  assert.equal(directMatch.topCandidate?.mudra, 'alapadma')
  assert.equal(directMatch.matchedOrientation, 'direct')
  assert.ok(directMatch.topCandidate.meanDist < 0.05, `Direct distance ${directMatch.topCandidate.meanDist} should be ~0`)

  // Mirrored (left hand) should match as 'mirrored' orientation with low distance
  assert.equal(mirroredMatch.topCandidate?.mudra, 'alapadma')
  assert.equal(mirroredMatch.matchedOrientation, 'mirrored')
  assert.ok(
    mirroredMatch.topCandidate.meanDist < 0.05,
    `Mirrored distance ${mirroredMatch.topCandidate.meanDist} should be ~0 with bilateral matching`
  )
})

test('5. Landmark jitter resilience on geometric feature extraction', () => {
  const hand = createMockHandAt(0.5, 0.5, 1.0)
  const featuresBase = extractHandFeatures(hand)
  assert.ok(featuresBase)

  // Introduce small random jitter (+-0.004) to all landmarks
  const jitteredHand = hand.map((p, idx) => ({
    x: p.x + (idx % 2 === 0 ? 0.003 : -0.003),
    y: p.y + (idx % 3 === 0 ? 0.003 : -0.002),
    z: p.z + 0.002,
  }))

  const featuresJittered = extractHandFeatures(jitteredHand)
  assert.ok(featuresJittered)

  // Finger extension state must remain consistent despite jitter
  assert.equal(featuresBase.fingers.index.isExtended, featuresJittered.fingers.index.isExtended)
  assert.equal(featuresBase.fingers.middle.isExtended, featuresJittered.fingers.middle.isExtended)
  assert.equal(featuresBase.fingers.ring.isExtended, featuresJittered.fingers.ring.isExtended)
  assert.equal(featuresBase.fingers.pinky.isExtended, featuresJittered.fingers.pinky.isExtended)
})

test('6. Hand quality classification and edge / distance detection', () => {
  // Normal centered hand -> optimal
  const normalHand = createMockHandAt(0.5, 0.5, 1.0)
  const normalMetrics = computeHandMetrics(normalHand, 0.15)
  assert.equal(normalMetrics.qualityStatus, 'optimal')
  assert.equal(normalMetrics.isNearEdge, false)
  assert.equal(normalMetrics.isTooSmall, false)

  // Tiny hand -> too_far
  const tinyHand = createMockHandAt(0.5, 0.5, 0.15)
  const tinyMetrics = computeHandMetrics(tinyHand, 0.02)
  assert.equal(tinyMetrics.isTooSmall, true)
  assert.equal(tinyMetrics.qualityStatus, 'too_far')

  // Truncated hand touching left edge (x <= 0.02)
  const edgeHand = createMockHandAt(0.01, 0.5, 1.0)
  const edgeMetrics = computeHandMetrics(edgeHand, 0.15)
  assert.equal(edgeMetrics.isNearEdge, true)
  assert.equal(edgeMetrics.qualityStatus, 'edge_truncated')
})

test('7. Data collection sample validation', () => {
  const validLandmarks = createMockHandAt(0.5, 0.5, 1.0)

  // Valid sample created
  const sample = createCollectedSample({
    label: 'tripataka',
    landmarks: validLandmarks,
    handedness: 'Right',
    sessionId: 'test_session',
  })

  const validation = validateCollectedSample(sample)
  assert.equal(validation.valid, true)
  assert.equal(sample.label, 'tripataka')
  assert.equal(sample.landmarks.length, 21)
  assert.equal(sample.handedness, 'Right')

  // Invalid: missing label
  const badLabel = validateCollectedSample({ ...sample, label: 'invalid_mudra' })
  assert.equal(badLabel.valid, false)

  // Invalid: wrong number of landmarks
  const badCount = validateCollectedSample({
    ...sample,
    landmarks: sample.landmarks.slice(0, 15),
  })
  assert.equal(badCount.valid, false)

  // Invalid: NaN coordinate
  const badCoord = validateCollectedSample({
    ...sample,
    landmarks: sample.landmarks.map((p, i) => (i === 5 ? { ...p, x: NaN } : p)),
  })
  assert.equal(badCoord.valid, false)
})

test('8. Dataset summary calculation', () => {
  const lm = createMockHandAt(0.5, 0.5, 1.0)
  const samples = [
    createCollectedSample({ label: 'pataka', landmarks: lm, sessionId: 's1' }),
    createCollectedSample({ label: 'pataka', landmarks: lm, sessionId: 's1' }),
    createCollectedSample({ label: 'musti', landmarks: lm, sessionId: 's1' }),
    createCollectedSample({ label: 'shikhara', landmarks: lm, sessionId: 's1' }),
  ]

  const summary = computeDatasetSummary(samples)
  assert.equal(summary.totalCount, 4)
  assert.equal(summary.countsByMudra.pataka, 2)
  assert.equal(summary.countsByMudra.musti, 1)
  assert.equal(summary.countsByMudra.shikhara, 1)
  assert.equal(summary.countsByMudra.alapadma, 0)
})

test('9. CSV export matches exact Phase 5B 64-column format', () => {
  const lm = createMockHandAt(0.5, 0.5, 1.0)
  const sample = createCollectedSample({
    label: 'alapadma',
    landmarks: lm,
    sessionId: 'session_csv',
  })

  const csv = exportSamplesToCsv([sample])
  const lines = csv.split('\n')
  assert.equal(lines.length, 2, 'Should have header + 1 data row')

  const headerCols = lines[0].split(',')
  assert.equal(headerCols.length, 64, 'Header must have exactly 64 columns')
  assert.equal(headerCols[0], 'label')
  assert.equal(headerCols[1], 'x_0')
  assert.equal(headerCols[2], 'y_0')
  assert.equal(headerCols[3], 'z_0')
  assert.equal(headerCols[61], 'x_20')
  assert.equal(headerCols[62], 'y_20')
  assert.equal(headerCols[63], 'z_20')

  const dataCols = lines[1].split(',')
  assert.equal(dataCols.length, 64, 'Data row must have exactly 64 columns')
  assert.equal(dataCols[0], 'Alapadma', 'Label should be capitalized in CSV')
  for (let i = 1; i < 64; i++) {
    assert.ok(Number.isFinite(Number(dataCols[i])), `Column ${i} must be a valid number`)
  }
})

test('10. CSV import and re-parse round-trip', () => {
  const lm1 = createMockHandAt(0.5, 0.5, 1.0)
  const lm2 = createMockHandAt(0.4, 0.6, 0.8)

  const originalSamples = [
    createCollectedSample({ label: 'pataka', landmarks: lm1, sessionId: 's1' }),
    createCollectedSample({ label: 'mukula', landmarks: lm2, sessionId: 's1' }),
  ]

  const csvText = exportSamplesToCsv(originalSamples)
  const { samples: importedSamples, errors } = importSamplesFromCsv(csvText, 'imported')

  assert.equal(errors.length, 0, `CSV import errors: ${errors.join(', ')}`)
  assert.equal(importedSamples.length, 2)
  assert.equal(importedSamples[0].label, 'pataka')
  assert.equal(importedSamples[1].label, 'mukula')

  for (let s = 0; s < 2; s++) {
    assert.equal(importedSamples[s].landmarks.length, 21)
    for (let i = 0; i < 21; i++) {
      assert.ok(
        Math.abs(importedSamples[s].landmarks[i].x - originalSamples[s].landmarks[i].x) < 1e-4,
        `Sample ${s} lm ${i} x mismatch`
      )
      assert.ok(
        Math.abs(importedSamples[s].landmarks[i].y - originalSamples[s].landmarks[i].y) < 1e-4,
        `Sample ${s} lm ${i} y mismatch`
      )
    }
  }
})

test('11. JSON export and import round-trip', () => {
  const lm = createMockHandAt(0.5, 0.5, 1.0)
  const original = [
    createCollectedSample({
      label: 'mayura',
      landmarks: lm,
      handedness: 'Left',
      sessionId: 'test_json',
    }),
  ]

  const jsonText = exportSamplesToJson(original)
  const { samples: imported, errors } = importSamplesFromJson(jsonText)

  assert.equal(errors.length, 0)
  assert.equal(imported.length, 1)
  assert.equal(imported[0].label, 'mayura')
  assert.equal(imported[0].handedness, 'Left')
  assert.equal(imported[0].landmarks.length, 21)
})
