import test from 'node:test'
import assert from 'node:assert/strict'
import {
  KNearestNeighbour,
  WeightedKNN,
  NaiveBayesGaussian,
  getBuiltinTrainingSamples,
  normalizeForML,
  mirrorLandmarks,
  flattenLandmarks,
  countPerClass,
} from '../lib/ml-classifier.ts'
import {
  runLOOCV,
  runPhase7AExperiment,
  buildConfusionMatrix,
} from '../lib/ml-evaluation.ts'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeHand(wristX = 0.5, wristY = 0.5, scale = 1.0) {
  // Minimal anatomically plausible hand pointing upward (y decreases toward fingertips)
  const base = [
    [0, 0, 0],                      // 0: Wrist
    [0.04, -0.04, -0.01],           // 1: Thumb CMC
    [0.07, -0.08, -0.02],           // 2: Thumb MCP
    [0.09, -0.12, -0.03],           // 3: Thumb IP
    [0.10, -0.16, -0.04],           // 4: Thumb TIP
    [0.03, -0.14, -0.01],           // 5: Index MCP
    [0.03, -0.20, -0.02],           // 6: Index PIP
    [0.03, -0.25, -0.03],           // 7: Index DIP
    [0.03, -0.30, -0.04],           // 8: Index TIP
    [0.00, -0.15, 0.00],            // 9: Middle MCP
    [0.00, -0.22, 0.00],            // 10: Middle PIP
    [0.00, -0.28, 0.00],            // 11: Middle DIP
    [0.00, -0.33, 0.00],            // 12: Middle TIP
    [-0.03, -0.14, 0.01],           // 13: Ring MCP
    [-0.03, -0.20, 0.02],           // 14: Ring PIP
    [-0.03, -0.25, 0.03],           // 15: Ring DIP
    [-0.03, -0.30, 0.04],           // 16: Ring TIP
    [-0.06, -0.12, 0.02],           // 17: Pinky MCP
    [-0.07, -0.17, 0.03],           // 18: Pinky PIP
    [-0.08, -0.21, 0.04],           // 19: Pinky DIP
    [-0.08, -0.25, 0.05],           // 20: Pinky TIP
  ]
  return base.map(([x, y, z]) => ({
    x: wristX + x * scale,
    y: wristY + y * scale,
    z: z * scale,
  }))
}

// ─── Dataset audit tests ──────────────────────────────────────────────────────

test('1. getBuiltinTrainingSamples returns correct count and labels', () => {
  const samples = getBuiltinTrainingSamples()
  assert.equal(samples.length, 12, 'Must have exactly 12 built-in reference samples')

  const labels = new Set(samples.map((s) => s.label))
  for (const expected of ['alapadma', 'ardhachandra', 'tripataka', 'mukula', 'pataka', 'mayura']) {
    assert.ok(labels.has(expected), `Must include ${expected}`)
  }
})

test('2. countPerClass reports 2 samples per supported mudra', () => {
  const samples = getBuiltinTrainingSamples()
  const counts = countPerClass(samples)
  for (const [label, count] of Object.entries(counts)) {
    assert.equal(count, 2, `${label} must have exactly 2 samples`)
  }
})

test('3. All built-in samples have valid pre-normalized representations', () => {
  const samples = getBuiltinTrainingSamples()
  for (const s of samples) {
    assert.ok(s.normalized, `${s.label} must have a normalized representation`)
    assert.equal(s.normalized.length, 21, 'Must have 21 landmarks after normalization')
    // Wrist (index 0) is always (0, 0, 0) after normalization
    assert.ok(Math.abs(s.normalized[0].x) < 1e-10, 'Wrist x must be ~0')
    assert.ok(Math.abs(s.normalized[0].y) < 1e-10, 'Wrist y must be ~0')
  }
})

test('4. normalizeForML is translation and scale invariant', () => {
  const baseHand = makeHand(0.5, 0.5, 1.0)
  const shiftedHand = makeHand(0.1, 0.9, 1.0)
  const scaledHand = makeHand(0.5, 0.5, 2.0)

  const n1 = normalizeForML(baseHand)
  const n2 = normalizeForML(shiftedHand)
  const n3 = normalizeForML(scaledHand)

  assert.ok(n1 && n2 && n3)
  for (let i = 0; i < 21; i++) {
    assert.ok(Math.abs(n1[i].x - n2[i].x) < 1e-5, `Translation: lm ${i} x mismatch`)
    assert.ok(Math.abs(n1[i].x - n3[i].x) < 1e-5, `Scale: lm ${i} x mismatch`)
  }
})

test('5. mirrorLandmarks flips x and preserves y/z', () => {
  const hand = makeHand(0.5, 0.5, 1.0)
  const normed = normalizeForML(hand)
  assert.ok(normed)
  const mirrored = mirrorLandmarks(normed)

  for (let i = 0; i < 21; i++) {
    assert.ok(Math.abs(mirrored[i].x + normed[i].x) < 1e-10, `Mirror: lm ${i} x not negated`)
    assert.ok(Math.abs(mirrored[i].y - normed[i].y) < 1e-10, `Mirror: lm ${i} y changed`)
    assert.ok(Math.abs(mirrored[i].z - normed[i].z) < 1e-10, `Mirror: lm ${i} z changed`)
  }
})

test('6. flattenLandmarks produces 63-dimensional vector', () => {
  const hand = makeHand(0.5, 0.5, 1.0)
  const normed = normalizeForML(hand)
  assert.ok(normed)
  const vec = flattenLandmarks(normed)
  assert.equal(vec.length, 63)
  for (let i = 0; i < 63; i++) {
    assert.ok(Number.isFinite(vec[i]), `Element ${i} must be finite`)
  }
})

// ─── KNN classifier tests ─────────────────────────────────────────────────────

test('7. KNN(k=1) predicts identity: querying a training sample returns its own label', () => {
  const samples = getBuiltinTrainingSamples()
  const clf = new KNearestNeighbour(1)
  clf.fit(samples, false) // no augmentation to avoid mirrored-self interference

  for (const s of samples) {
    const result = clf.predict(s.landmarks)
    assert.equal(
      result.label,
      s.label,
      `KNN should predict ${s.label} when querying the exact training sample`,
    )
    assert.equal(result.confidence, 1.0, 'k=1 always gives confidence=1.0')
  }
})

test('8. WeightedKNN(k=1) predicts identity on training samples', () => {
  const samples = getBuiltinTrainingSamples()
  const clf = new WeightedKNN(1)
  clf.fit(samples, false)

  for (const s of samples) {
    const result = clf.predict(s.landmarks)
    assert.equal(result.label, s.label, `WeightedKNN should identify ${s.label}`)
  }
})

test('9. NaiveBayesGaussian predicts identity on training samples', () => {
  const samples = getBuiltinTrainingSamples()
  const clf = new NaiveBayesGaussian()
  clf.fit(samples, false)

  for (const s of samples) {
    const result = clf.predict(s.landmarks)
    assert.equal(result.label, s.label, `NaiveBayes should identify ${s.label}`)
    assert.ok(result.confidence > 0 && result.confidence <= 1.0, 'Confidence in [0, 1]')
  }
})

test('10. KNN returns null/uncertain for missing/degenerate input', () => {
  const clf = new KNearestNeighbour(1)
  clf.fit(getBuiltinTrainingSamples(), false)

  // Empty landmarks
  const r1 = clf.predict([])
  assert.equal(r1.label, null)
  assert.equal(r1.confidence, 0)
})

test('11. NaiveBayesGaussian confidence values sum to approximately 1', () => {
  const samples = getBuiltinTrainingSamples()
  const clf = new NaiveBayesGaussian()
  clf.fit(samples, false)

  const result = clf.predict(samples[0].landmarks)
  const totalProb = result.distances.reduce((s, d) => s + (1 - d.distance), 0)
  // Softmax output: total probabilities across classes should be ~1
  assert.ok(Math.abs(totalProb - 1.0) < 0.01, `Total prob ${totalProb} should be ~1`)
})

// ─── LOOCV tests ─────────────────────────────────────────────────────────────

test('12. LOOCV on KNN(k=1) returns valid structure', () => {
  const samples = getBuiltinTrainingSamples()
  const clf = new KNearestNeighbour(1)
  const result = runLOOCV(clf, samples, false)

  assert.equal(result.predictions.length, 12, 'Must have one prediction per sample')
  assert.ok(result.accuracy >= 0 && result.accuracy <= 1, `Accuracy ${result.accuracy} in [0,1]`)
  assert.ok(result.macroF1 >= 0 && result.macroF1 <= 1, `Macro-F1 ${result.macroF1} in [0,1]`)
  assert.equal(result.datasetInfo.totalSamples, 12)
})

test('13. LOOCV confusion matrix has correct dimensions', () => {
  const samples = getBuiltinTrainingSamples()
  const clf = new KNearestNeighbour(1)
  const result = runLOOCV(clf, samples, false)

  const cm = result.confusionMatrix
  assert.equal(cm.labels.length, 6, 'Should have 6 unique class labels')
  assert.equal(cm.matrix.length, 6, 'Matrix has 6 rows')
  for (const row of cm.matrix) {
    assert.equal(row.length, 6, 'Each matrix row has 6 columns')
  }

  // Total predictions = number of test samples
  const totalPreds = cm.matrix.flat().reduce((s, v) => s + v, 0)
  assert.equal(totalPreds, 12)
})

test('14. LOOCV KNN with bilateral augmentation achieves high accuracy on tiny dataset', () => {
  const samples = getBuiltinTrainingSamples()
  const clf = new KNearestNeighbour(1)
  const result = runLOOCV(clf, samples, true)

  // With bilateral augmentation and 2 samples per class, the held-out sample's
  // other intra-class sample + its mirror are in training, so LOOCV accuracy
  // should be 1.0 (or very close). This validates the normalization pipeline.
  assert.ok(result.accuracy >= 0.9, `Expected ≥ 90% accuracy, got ${result.accuracy}`)
})

test('15. runPhase7AExperiment returns a valid structured report', () => {
  const report = runPhase7AExperiment()

  assert.ok(report.timestamp, 'Must have a timestamp')
  assert.ok(Array.isArray(report.classifierComparison), 'Must have classifier comparison')
  assert.ok(report.classifierComparison.length >= 3, 'Must compare at least 3 classifiers')
  assert.ok(Array.isArray(report.detailedResults), 'Must have detailed results')
  assert.equal(report.datasetSummary.totalSamples, 12)
  assert.ok(report.datasetSummary.classesWithoutSamples.length > 0, 'Must note missing mudra classes')

  // All classifiers must have valid metrics
  for (const row of report.classifierComparison) {
    assert.ok(row.accuracy >= 0 && row.accuracy <= 1, `${row.method} accuracy out of range`)
    assert.ok(row.macroF1 >= 0 && row.macroF1 <= 1, `${row.method} macro-F1 out of range`)
  }

  // Missing classes must include the 4 unsupported mudras
  for (const missing of ['musti', 'suchi', 'shikhara', 'ardhapataka']) {
    assert.ok(
      report.datasetSummary.classesWithoutSamples.includes(missing),
      `${missing} must be listed as unsupported`,
    )
  }
})

test('16. WeightedKNN and KNN produce same label predictions on tiny dataset', () => {
  // Both should identify training samples correctly with k=1
  const samples = getBuiltinTrainingSamples()
  const knn = new KNearestNeighbour(1)
  const wknn = new WeightedKNN(1)
  knn.fit(samples, false)
  wknn.fit(samples, false)

  for (const s of samples) {
    const r1 = knn.predict(s.landmarks)
    const r2 = wknn.predict(s.landmarks)
    assert.equal(r1.label, r2.label, `KNN and WeightedKNN should agree on ${s.label}`)
  }
})
