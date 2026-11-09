import test from 'node:test'
import assert from 'node:assert/strict'
import {
  dist3D,
  vecSub,
  vecDot,
  vecMag,
  jointAngle,
  extractHandFeatures,
  LANDMARK_INDEX,
} from '../lib/geometric-features.ts'

// Helper: create a default base 21-point hand
function createFlatHand() {
  const lm = []
  // 0: Wrist
  lm[0] = { x: 0.5, y: 0.8, z: 0 }

  // Thumb: 1, 2, 3, 4
  lm[1] = { x: 0.44, y: 0.74, z: 0 } // CMC
  lm[2] = { x: 0.4, y: 0.67, z: 0 }  // MCP
  lm[3] = { x: 0.38, y: 0.61, z: 0 } // IP
  lm[4] = { x: 0.37, y: 0.56, z: 0 } // TIP

  // Index: 5, 6, 7, 8 (straight upward)
  lm[5] = { x: 0.44, y: 0.55, z: 0 } // MCP
  lm[6] = { x: 0.44, y: 0.45, z: 0 } // PIP
  lm[7] = { x: 0.44, y: 0.37, z: 0 } // DIP
  lm[8] = { x: 0.44, y: 0.3, z: 0 }  // TIP

  // Middle: 9, 10, 11, 12 (straight upward)
  lm[9] = { x: 0.5, y: 0.54, z: 0 }  // MCP
  lm[10] = { x: 0.5, y: 0.43, z: 0 } // PIP
  lm[11] = { x: 0.5, y: 0.34, z: 0 } // DIP
  lm[12] = { x: 0.5, y: 0.27, z: 0 } // TIP

  // Ring: 13, 14, 15, 16 (straight upward)
  lm[13] = { x: 0.56, y: 0.55, z: 0 } // MCP
  lm[14] = { x: 0.56, y: 0.45, z: 0 } // PIP
  lm[15] = { x: 0.56, y: 0.37, z: 0 } // DIP
  lm[16] = { x: 0.56, y: 0.3, z: 0 }  // TIP

  // Pinky: 17, 18, 19, 20 (straight upward)
  lm[17] = { x: 0.61, y: 0.58, z: 0 } // MCP
  lm[18] = { x: 0.61, y: 0.5, z: 0 }  // PIP
  lm[19] = { x: 0.61, y: 0.43, z: 0 } // DIP
  lm[20] = { x: 0.61, y: 0.37, z: 0 } // TIP

  return lm
}

test('1. Vector and geometry utilities', () => {
  const p1 = { x: 0, y: 0, z: 0 }
  const p2 = { x: 3, y: 4, z: 0 }
  assert.equal(dist3D(p1, p2), 5)

  const diff = vecSub(p1, p2)
  assert.deepEqual(diff, { x: 3, y: 4, z: 0 })
  assert.equal(vecMag(diff), 5)
  assert.equal(vecDot({ x: 1, y: 2, z: 3 }, { x: 4, y: -2, z: 1 }), 3)

  // Straight line angle -> 180 deg
  const a = { x: 0, y: 0, z: 0 }
  const b = { x: 1, y: 0, z: 0 }
  const c = { x: 2, y: 0, z: 0 }
  assert.equal(Math.round(jointAngle(a, b, c)), 180)

  // Right angle -> 90 deg
  const d = { x: 1, y: 1, z: 0 }
  assert.equal(Math.round(jointAngle(a, b, d)), 90)
})

test('2. extractHandFeatures rejects invalid, missing, or degenerate landmarks safely', () => {
  assert.equal(extractHandFeatures(null), null)
  assert.equal(extractHandFeatures(undefined), null)
  assert.equal(extractHandFeatures([]), null)
  assert.equal(extractHandFeatures(new Array(20).fill({ x: 0, y: 0, z: 0 })), null)

  const invalidCoords = createFlatHand()
  invalidCoords[5] = { x: Number.NaN, y: 0.5, z: 0 }
  assert.equal(extractHandFeatures(invalidCoords), null)

  const infiniteCoords = createFlatHand()
  infiniteCoords[0] = { x: Number.POSITIVE_INFINITY, y: 0, z: 0 }
  assert.equal(extractHandFeatures(infiniteCoords), null)

  // Degenerate hand where wrist == middle MCP (palmScale = 0)
  const collapsed = createFlatHand()
  collapsed[LANDMARK_INDEX.MIDDLE_MCP] = { ...collapsed[LANDMARK_INDEX.WRIST] }
  assert.equal(extractHandFeatures(collapsed), null)
})

test('3. Feature extraction calculates scale-invariant values on valid hand', () => {
  const hand = createFlatHand()
  const features = extractHandFeatures(hand)
  assert.ok(features)

  // Middle MCP (0.5, 0.54) to Wrist (0.5, 0.8) -> dy = 0.26
  assert.equal(Math.round(features.palmScale * 100), 26)

  // Index, Middle, Ring, Pinky should all be detected as extended
  assert.equal(features.fingers.index.isExtended, true)
  assert.equal(features.fingers.middle.isExtended, true)
  assert.equal(features.fingers.ring.isExtended, true)
  assert.equal(features.fingers.pinky.isExtended, true)

  assert.equal(features.fingers.index.isCurled, false)
  assert.equal(features.fingers.middle.isCurled, false)

  // Adjacent fingertip distances should be positive and normalized
  assert.ok(features.tipDistances.indexMiddle > 0)
  assert.ok(features.tipDistances.middleRing > 0)
  assert.ok(features.tipDistances.ringPinky > 0)
  assert.ok(features.fingerSpread > 0)
})

test('4. Correctly detects finger curl when joints bend into palm', () => {
  const hand = createFlatHand()
  // Curl index finger: fold PIP and DIP into palm towards MCP
  hand[6] = { x: 0.44, y: 0.58, z: 0 } // PIP bent down
  hand[7] = { x: 0.44, y: 0.62, z: 0.05 } // DIP curled towards palm
  hand[8] = { x: 0.44, y: 0.6, z: 0.08 } // TIP curled inward

  const features = extractHandFeatures(hand)
  assert.ok(features)
  assert.equal(features.fingers.index.isCurled, true)
  assert.equal(features.fingers.index.isExtended, false)
  assert.ok(features.fingers.index.extension < 0.4)

  // Middle finger remains extended
  assert.equal(features.fingers.middle.isExtended, true)
})

test('5. Thumb abduction and pointing up calculations', () => {
  const hand = createFlatHand()

  // Case A: Thumb tucked beside index
  hand[4] = { x: 0.42, y: 0.58, z: 0 }
  const featTucked = extractHandFeatures(hand)
  assert.ok(featTucked)
  assert.equal(featTucked.thumb.isAbducted, false)

  // Case B: Thumb stretched wide outward (Ardhachandra style)
  hand[4] = { x: 0.15, y: 0.68, z: 0 } // Abducted far to the side
  const featAbducted = extractHandFeatures(hand)
  assert.ok(featAbducted)
  assert.equal(featAbducted.thumb.isAbducted, true)
  assert.ok(featAbducted.thumb.abductionAngle > 46)

  // Case C: Thumb pointing straight upward (Shikhara style)
  hand[1] = { x: 0.45, y: 0.75, z: 0 }
  hand[2] = { x: 0.44, y: 0.68, z: 0 }
  hand[3] = { x: 0.44, y: 0.58, z: 0 }
  hand[4] = { x: 0.44, y: 0.48, z: 0 } // tip points straight up
  const featUp = extractHandFeatures(hand)
  assert.ok(featUp)
  assert.equal(featUp.thumb.isPointingUp, true)
})
