import test from 'node:test'
import assert from 'node:assert/strict'
import { extractHandFeatures } from '../lib/geometric-features.ts'
import {
  evaluateMudraRulesDetailed,
  explainMudraConditions,
  getMudraRejectionReasons,
} from '../lib/mudra-rules.ts'
import { TemporalStabilizer } from '../lib/stabilizer.ts'
import {
  shouldRenderCalibrationDashboard,
  getMudraDiagnosticSnapshot,
} from '../lib/calibration.ts'

function makeTestHand() {
  const lm = []
  // Wrist
  lm[0] = { x: 0.5, y: 0.8, z: 0 }
  // Thumb
  lm[1] = { x: 0.44, y: 0.74, z: 0 }
  lm[2] = { x: 0.4, y: 0.67, z: 0 }
  lm[3] = { x: 0.38, y: 0.61, z: 0 }
  lm[4] = { x: 0.41, y: 0.57, z: 0 }
  // Index
  lm[5] = { x: 0.44, y: 0.55, z: 0 }
  lm[6] = { x: 0.44, y: 0.45, z: 0 }
  lm[7] = { x: 0.44, y: 0.37, z: 0 }
  lm[8] = { x: 0.44, y: 0.3, z: 0 }
  // Middle
  lm[9] = { x: 0.5, y: 0.54, z: 0 }
  lm[10] = { x: 0.5, y: 0.43, z: 0 }
  lm[11] = { x: 0.5, y: 0.34, z: 0 }
  lm[12] = { x: 0.5, y: 0.27, z: 0 }
  // Ring
  lm[13] = { x: 0.56, y: 0.55, z: 0 }
  lm[14] = { x: 0.56, y: 0.45, z: 0 }
  lm[15] = { x: 0.56, y: 0.37, z: 0 }
  lm[16] = { x: 0.56, y: 0.3, z: 0 }
  // Pinky
  lm[17] = { x: 0.61, y: 0.58, z: 0 }
  lm[18] = { x: 0.61, y: 0.5, z: 0 }
  lm[19] = { x: 0.61, y: 0.43, z: 0 }
  lm[20] = { x: 0.61, y: 0.37, z: 0 }
  return lm
}

test('1. Diagnostic values match actual feature extraction', () => {
  const lm = makeTestHand()
  const features = extractHandFeatures(lm)
  assert.ok(features)

  const conditions = explainMudraConditions('pataka', features)
  assert.ok(conditions.length >= 3)

  // Verify condition labels and values match extracted features
  const spreadCheck = conditions.find((c) => c.id === 'low_spread')
  assert.ok(spreadCheck)
  assert.equal(spreadCheck.passed, true)
  assert.ok(spreadCheck.actual.includes(features.fingerSpread.toFixed(2)))

  const thumbCheck = conditions.find((c) => c.id === 'thumb_tucked')
  assert.ok(thumbCheck)
  assert.equal(thumbCheck.passed, true)
  assert.ok(thumbCheck.actual.includes(`${features.thumb.abductionAngle}°`))
})

test('2. Rule pass/fail explanations match actual rule evaluations', () => {
  const lm = makeTestHand()
  // Abduct thumb wide (Ardhachandra style) while testing Pataka
  lm[1] = { x: 0.44, y: 0.74, z: 0 }
  lm[2] = { x: 0.36, y: 0.73, z: 0 }
  lm[3] = { x: 0.27, y: 0.72, z: 0 }
  lm[4] = { x: 0.18, y: 0.72, z: 0 }

  const features = extractHandFeatures(lm)
  assert.ok(features)

  const detailed = evaluateMudraRulesDetailed(features)
  const patakaConditions = explainMudraConditions('pataka', features)
  const thumbTucked = patakaConditions.find((c) => c.id === 'thumb_tucked')
  assert.ok(thumbTucked)
  assert.equal(thumbTucked.passed, false, 'Thumb tucked condition should fail when thumb is abducted')

  // Generate rejection reasons for Pataka
  const reasons = getMudraRejectionReasons('pataka', features, detailed)
  assert.ok(reasons.length > 0)
  assert.ok(
    reasons.some((r) => r.toLowerCase().includes('thumb beside index') || r.toLowerCase().includes('abduction')),
    'Rejection reasons must explain why thumb condition failed',
  )
})

test('3. Candidate ranking and score margins are accurately calculated', () => {
  const lm = makeTestHand()
  const features = extractHandFeatures(lm)
  assert.ok(features)

  const detailed = evaluateMudraRulesDetailed(features)
  assert.equal(detailed.evaluations.length, 10, 'All 10 mudra rules must be evaluated')

  // Evaluations must be sorted descending by score
  for (let i = 0; i < detailed.evaluations.length - 1; i++) {
    assert.ok(
      detailed.evaluations[i].score >= detailed.evaluations[i + 1].score,
      'Evaluations should be ordered by score descending',
    )
  }

  assert.equal(detailed.topCandidate?.mudra, detailed.evaluations[0].mudra)
  assert.equal(detailed.runnerUp?.mudra, detailed.evaluations[1].mudra)

  const expectedMargin = Number(
    Math.max(0, detailed.evaluations[0].score - detailed.evaluations[1].score).toFixed(3),
  )
  assert.equal(detailed.margin, expectedMargin)
})

test('4. Stabilization diagnostic snapshot exposes accurate internal state', () => {
  const stabilizer = new TemporalStabilizer({ windowSize: 8, consensusThreshold: 5, hysteresisHold: 4 })

  // Initial state check
  const initDiag = stabilizer.getDiagnostics()
  assert.equal(initDiag.windowSize, 8)
  assert.equal(initDiag.consensusThreshold, 5)
  assert.equal(initDiag.hysteresisHold, 4)
  assert.equal(initDiag.currentMudra, null)
  assert.equal(initDiag.history.length, 0)
  assert.equal(initDiag.topCandidateCount, 0)

  // Feed 3 frames of Pataka
  const mockPataka = {
    status: 'recognized',
    mudra: 'pataka',
    score: 0.92,
    description: 'Mock Pataka',
    breakdown: {},
  }

  stabilizer.update(mockPataka)
  stabilizer.update(mockPataka)
  stabilizer.update(mockPataka)

  const activeDiag = stabilizer.getDiagnostics()
  assert.equal(activeDiag.history.length, 3)
  assert.equal(activeDiag.consensusCounts['pataka'], 3)
  assert.equal(activeDiag.topCandidateCount, 3)
  assert.equal(activeDiag.topCandidateMudra, 'pataka')

  // Reset clears diagnostic state
  stabilizer.reset()
  const resetDiag = stabilizer.getDiagnostics()
  assert.equal(resetDiag.history.length, 0)
  assert.equal(resetDiag.currentMudra, null)
  assert.equal(resetDiag.topCandidateCount, 0)
})

test('5. Calibration dashboard is strictly hidden in production mode', () => {
  // shouldRenderCalibrationDashboard must return false when isDev is false
  assert.equal(
    shouldRenderCalibrationDashboard(false),
    false,
    'Dashboard rendering must evaluate to false when isDev is false',
  )
  assert.equal(
    shouldRenderCalibrationDashboard(true),
    true,
    'Dashboard rendering must evaluate to true when isDev is true',
  )
})

test('6. Missing hand and invalid landmarks handled safely without exceptions', () => {
  const nullDetailed = evaluateMudraRulesDetailed(null)
  assert.equal(nullDetailed.result.status, 'no_hand')
  assert.equal(nullDetailed.evaluations.length, 0)
  assert.equal(nullDetailed.topCandidate, null)
  assert.equal(nullDetailed.runnerUp, null)
  assert.equal(nullDetailed.margin, 0)

  const nullConditions = explainMudraConditions('pataka', null)
  assert.equal(nullConditions.length, 1)
  assert.equal(nullConditions[0].passed, false)
  assert.ok(nullConditions[0].actual.includes('No hand detected'))

  const nullReasons = getMudraRejectionReasons('pataka', null, nullDetailed)
  assert.deepEqual(nullReasons, ['No hand detected in camera view'])
})
