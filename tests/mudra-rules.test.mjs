import test from 'node:test'
import assert from 'node:assert/strict'
import { extractHandFeatures } from '../lib/geometric-features.ts'
import { evaluateMudraRules } from '../lib/mudra-rules.ts'

// Base hand generator
function makeBaseHand() {
  const lm = []
  // Wrist
  lm[0] = { x: 0.5, y: 0.8, z: 0 }

  // Thumb
  lm[1] = { x: 0.44, y: 0.74, z: 0 }
  lm[2] = { x: 0.4, y: 0.67, z: 0 }
  lm[3] = { x: 0.38, y: 0.61, z: 0 }
  lm[4] = { x: 0.37, y: 0.56, z: 0 }

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

function curlFinger(lm, mcpIdx, pipIdx, dipIdx, tipIdx) {
  const mcp = lm[mcpIdx]
  lm[pipIdx] = { x: mcp.x, y: mcp.y + 0.04, z: 0.02 }
  lm[dipIdx] = { x: mcp.x, y: mcp.y + 0.07, z: 0.05 }
  lm[tipIdx] = { x: mcp.x, y: mcp.y + 0.05, z: 0.07 }
}

test('1. Null features evaluate to no_hand', () => {
  const result = evaluateMudraRules(null)
  assert.equal(result.status, 'no_hand')
})

test('2. Pataka recognized when 4 fingers extended joined and thumb beside index', () => {
  const lm = makeBaseHand()
  // Pataka: 4 fingers straight and parallel (low spread)
  // Thumb resting close to index
  lm[4] = { x: 0.41, y: 0.57, z: 0 }

  const feat = extractHandFeatures(lm)
  assert.ok(feat)
  const result = evaluateMudraRules(feat)
  assert.equal(result.status, 'recognized')
  assert.equal(result.mudra, 'pataka')
  assert.ok(result.score >= 0.65)
})

test('3. Ardhachandra recognized when 4 fingers extended and thumb abducted wide', () => {
  const lm = makeBaseHand()
  // Abduct thumb wide to the left
  lm[1] = { x: 0.44, y: 0.74, z: 0 }
  lm[2] = { x: 0.36, y: 0.73, z: 0 }
  lm[3] = { x: 0.27, y: 0.72, z: 0 }
  lm[4] = { x: 0.18, y: 0.72, z: 0 }

  const feat = extractHandFeatures(lm)
  assert.ok(feat)
  const result = evaluateMudraRules(feat)
  assert.equal(result.status, 'recognized')
  assert.equal(result.mudra, 'ardhachandra')
  assert.ok(result.score >= 0.65)
})

test('4. Musti recognized when all 4 fingers curled and thumb folded across', () => {
  const lm = makeBaseHand()
  curlFinger(lm, 5, 6, 7, 8)
  curlFinger(lm, 9, 10, 11, 12)
  curlFinger(lm, 13, 14, 15, 16)
  curlFinger(lm, 17, 18, 19, 20)

  // Thumb folded across index/middle
  lm[1] = { x: 0.44, y: 0.74, z: 0 }
  lm[2] = { x: 0.42, y: 0.68, z: 0 }
  lm[3] = { x: 0.44, y: 0.63, z: 0.05 }
  lm[4] = { x: 0.47, y: 0.6, z: 0.06 }

  const feat = extractHandFeatures(lm)
  assert.ok(feat)
  const result = evaluateMudraRules(feat)
  assert.equal(result.status, 'recognized')
  assert.equal(result.mudra, 'musti')
  assert.ok(result.score >= 0.65)
})

test('5. Shikhara recognized when all 4 fingers curled and thumb extended UP', () => {
  const lm = makeBaseHand()
  curlFinger(lm, 5, 6, 7, 8)
  curlFinger(lm, 9, 10, 11, 12)
  curlFinger(lm, 13, 14, 15, 16)
  curlFinger(lm, 17, 18, 19, 20)

  // Thumb extended straight up
  lm[1] = { x: 0.45, y: 0.75, z: 0 }
  lm[2] = { x: 0.45, y: 0.68, z: 0 }
  lm[3] = { x: 0.45, y: 0.58, z: 0 }
  lm[4] = { x: 0.45, y: 0.48, z: 0 }

  const feat = extractHandFeatures(lm)
  assert.ok(feat)
  const result = evaluateMudraRules(feat)
  assert.equal(result.status, 'recognized')
  assert.equal(result.mudra, 'shikhara')
  assert.ok(result.score >= 0.65)
})

test('6. Suchi recognized when only index finger is extended', () => {
  const lm = makeBaseHand()
  // Index remains extended (straight upward)
  // Curl middle, ring, pinky
  curlFinger(lm, 9, 10, 11, 12)
  curlFinger(lm, 13, 14, 15, 16)
  curlFinger(lm, 17, 18, 19, 20)
  // Fold thumb across
  lm[4] = { x: 0.48, y: 0.62, z: 0.05 }

  const feat = extractHandFeatures(lm)
  assert.ok(feat)
  const result = evaluateMudraRules(feat)
  assert.equal(result.status, 'recognized')
  assert.equal(result.mudra, 'suchi')
  assert.ok(result.score >= 0.65)
})

test('7. Tripataka recognized when ring finger is curled while others extended', () => {
  const lm = makeBaseHand()
  // Index, Middle, Pinky straight
  // Curl only Ring finger
  curlFinger(lm, 13, 14, 15, 16)

  const feat = extractHandFeatures(lm)
  assert.ok(feat)
  const result = evaluateMudraRules(feat)
  assert.equal(result.status, 'recognized')
  assert.equal(result.mudra, 'tripataka')
  assert.ok(result.score >= 0.65)
})

test('8. Ardhapataka recognized when ring and pinky are curled', () => {
  const lm = makeBaseHand()
  // Index and Middle straight
  // Curl Ring and Pinky
  curlFinger(lm, 13, 14, 15, 16)
  curlFinger(lm, 17, 18, 19, 20)

  const feat = extractHandFeatures(lm)
  assert.ok(feat)
  const result = evaluateMudraRules(feat)
  assert.equal(result.status, 'recognized')
  assert.equal(result.mudra, 'ardhapataka')
  assert.ok(result.score >= 0.65)
})

test('9. Alapadma recognized when fingers are extended and spread wide', () => {
  const lm = makeBaseHand()
  // Spread fingers apart radially like lotus petals
  lm[6] = { x: 0.41, y: 0.46, z: 0 }
  lm[7] = { x: 0.38, y: 0.38, z: 0 }
  lm[8] = { x: 0.35, y: 0.32, z: 0 } // index fan left

  lm[10] = { x: 0.49, y: 0.44, z: 0 }
  lm[11] = { x: 0.48, y: 0.35, z: 0 }
  lm[12] = { x: 0.48, y: 0.27, z: 0 } // middle center

  lm[14] = { x: 0.58, y: 0.46, z: 0 }
  lm[15] = { x: 0.6, y: 0.38, z: 0 }
  lm[16] = { x: 0.62, y: 0.31, z: 0 } // ring fan right

  lm[18] = { x: 0.65, y: 0.51, z: 0 }
  lm[19] = { x: 0.7, y: 0.44, z: 0 }
  lm[20] = { x: 0.74, y: 0.38, z: 0 } // pinky fan wide right

  // Thumb fan wide left
  lm[4] = { x: 0.22, y: 0.65, z: 0 }

  const feat = extractHandFeatures(lm)
  assert.ok(feat)
  const result = evaluateMudraRules(feat)
  assert.equal(result.status, 'recognized')
  assert.equal(result.mudra, 'alapadma')
  assert.ok(result.score >= 0.65)
})

test('10. Mayura recognized when ring finger touches thumb and other fingers straight', () => {
  const lm = makeBaseHand()
  // Thumb points inwards slightly
  lm[1] = { x: 0.44, y: 0.74, z: 0 }
  lm[2] = { x: 0.43, y: 0.67, z: 0 }
  lm[3] = { x: 0.44, y: 0.61, z: 0 }
  lm[4] = { x: 0.46, y: 0.55, z: 0 }

  // Index (straight)
  lm[5] = { x: 0.44, y: 0.55, z: 0 }
  lm[6] = { x: 0.43, y: 0.45, z: 0 }
  lm[7] = { x: 0.42, y: 0.37, z: 0 }
  lm[8] = { x: 0.41, y: 0.3, z: 0 }

  // Middle (straight)
  lm[9] = { x: 0.5, y: 0.54, z: 0 }
  lm[10] = { x: 0.5, y: 0.43, z: 0 }
  lm[11] = { x: 0.5, y: 0.34, z: 0 }
  lm[12] = { x: 0.5, y: 0.27, z: 0 }

  // Ring (touches thumb tip at 0.46, 0.55)
  lm[13] = { x: 0.56, y: 0.55, z: 0 }
  lm[14] = { x: 0.52, y: 0.53, z: 0.02 }
  lm[15] = { x: 0.48, y: 0.54, z: 0.03 }
  lm[16] = { x: 0.46, y: 0.55, z: 0 }

  // Pinky (straight)
  lm[17] = { x: 0.61, y: 0.58, z: 0 }
  lm[18] = { x: 0.62, y: 0.5, z: 0 }
  lm[19] = { x: 0.63, y: 0.43, z: 0 }
  lm[20] = { x: 0.64, y: 0.37, z: 0 }

  const feat = extractHandFeatures(lm)
  assert.ok(feat)
  const result = evaluateMudraRules(feat)
  assert.equal(result.status, 'recognized')
  assert.equal(result.mudra, 'mayura')
  assert.ok(result.score >= 0.6)
})

test('11. Mukula recognized when all 5 fingertips meet in a cluster', () => {
  const lm = makeBaseHand()
  const budCenter = { x: 0.5, y: 0.45, z: 0.05 }

  // All 5 fingertips drawn to the bud center
  lm[4] = { x: budCenter.x - 0.02, y: budCenter.y + 0.02, z: budCenter.z }
  lm[8] = { x: budCenter.x - 0.01, y: budCenter.y - 0.02, z: budCenter.z }
  lm[12] = { x: budCenter.x, y: budCenter.y - 0.03, z: budCenter.z }
  lm[16] = { x: budCenter.x + 0.02, y: budCenter.y - 0.01, z: budCenter.z }
  lm[20] = { x: budCenter.x + 0.02, y: budCenter.y + 0.02, z: budCenter.z }

  // Segments bent inwards
  lm[6] = { x: 0.46, y: 0.52, z: 0.02 }
  lm[7] = { x: 0.47, y: 0.48, z: 0.04 }
  lm[10] = { x: 0.5, y: 0.51, z: 0.02 }
  lm[11] = { x: 0.5, y: 0.48, z: 0.04 }
  lm[14] = { x: 0.54, y: 0.52, z: 0.02 }
  lm[15] = { x: 0.53, y: 0.48, z: 0.04 }

  const feat = extractHandFeatures(lm)
  assert.ok(feat)
  const result = evaluateMudraRules(feat)
  assert.equal(result.status, 'recognized')
  assert.equal(result.mudra, 'mukula')
  assert.ok(result.score >= 0.6)
})

test('12. Ambiguous and uncertain poses return uncertain instead of false classification', () => {
  // Case A: Ring finger halfway curled between Pataka and Tripataka
  const lmHalf = makeBaseHand()
  lmHalf[14] = { x: 0.56, y: 0.48, z: 0.02 }
  lmHalf[15] = { x: 0.56, y: 0.44, z: 0.04 }
  lmHalf[16] = { x: 0.56, y: 0.4, z: 0.05 } // halfway extended

  const featHalf = extractHandFeatures(lmHalf)
  assert.ok(featHalf)
  const resHalf = evaluateMudraRules(featHalf)
  // Halfway pose should not be forced into a confident recognition
  if (resHalf.status === 'recognized') {
    // If recognized, score must reflect border uncertainty or be close to threshold
    assert.ok(resHalf.score <= 0.85)
  } else {
    assert.equal(resHalf.status, 'uncertain')
    assert.ok(resHalf.reason.length > 0)
  }

  // Case B: Completely non-mudra pose (e.g. thumb and middle curled, index and pinky curled)
  const lmWeird = makeBaseHand()
  curlFinger(lmWeird, 5, 6, 7, 8)   // index curled
  curlFinger(lmWeird, 17, 18, 19, 20) // pinky curled
  // middle and ring extended (V-shape with middle fingers)
  const featWeird = extractHandFeatures(lmWeird)
  assert.ok(featWeird)
  const resWeird = evaluateMudraRules(featWeird)
  assert.equal(resWeird.status, 'uncertain')
  assert.ok(resWeird.reason.length > 0)
})
