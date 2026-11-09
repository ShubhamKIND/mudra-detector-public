import test from 'node:test'
import assert from 'node:assert/strict'
import { MudraEngine } from '../lib/mudra-engine.ts'

function makeHand() {
  const lm = []
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

test('1. MudraEngine end-to-end: extracts features, classifies, and stabilizes', () => {
  const engine = new MudraEngine({ windowSize: 6, consensusThreshold: 4 })

  // Send 3 frames of Pataka hand (not stabilized yet)
  const hand = makeHand()
  for (let i = 0; i < 3; i++) {
    const out = engine.processFrame(hand)
    assert.ok(out.features)
    assert.equal(out.raw.status, 'recognized')
    assert.equal(out.raw.mudra, 'pataka')
    assert.equal(out.stabilized.status, 'uncertain')
  }

  // 4th frame reaches consensus threshold
  const frame4 = engine.processFrame(hand)
  assert.equal(frame4.stabilized.status, 'recognized')
  assert.equal(frame4.stabilized.mudra, 'pataka')
  assert.equal(frame4.stabilized.isNewRecognition, true)

  // Empty landmarks transitions immediately to no_hand
  const emptyOut = engine.processFrame(null)
  assert.equal(emptyOut.raw.status, 'no_hand')
  assert.equal(emptyOut.stabilized.status, 'no_hand')
  assert.equal(emptyOut.features, null)
})
