import test from 'node:test'
import assert from 'node:assert/strict'
import { TemporalStabilizer } from '../lib/stabilizer.ts'

function mockRecognized(mudra, score = 0.85) {
  return {
    status: 'recognized',
    mudra,
    score,
    description: `Mock ${mudra}`,
    breakdown: {},
  }
}

function mockUncertain(reason = 'Ambiguous pose') {
  return {
    status: 'uncertain',
    reason,
  }
}

function mockNoHand() {
  return {
    status: 'no_hand',
    reason: 'No hand detected',
  }
}

test('1. Requires multi-frame consensus before declaring recognized', () => {
  const stabilizer = new TemporalStabilizer({ windowSize: 8, consensusThreshold: 5 })

  // Frames 1 to 4: not enough consensus yet
  for (let i = 1; i <= 4; i++) {
    const res = stabilizer.update(mockRecognized('pataka'))
    assert.equal(res.status, 'uncertain', `Frame ${i} should still be uncertain`)
    assert.equal(res.isNewRecognition, false)
  }

  // Frame 5: consensus reached (5 out of 5 frames are pataka)
  const frame5 = stabilizer.update(mockRecognized('pataka'))
  assert.equal(frame5.status, 'recognized')
  assert.equal(frame5.mudra, 'pataka')
  assert.equal(frame5.isNewRecognition, true, 'First recognized frame must set isNewRecognition: true')

  // Frame 6: still pataka, but isNewRecognition must be false (audio trigger guard)
  const frame6 = stabilizer.update(mockRecognized('pataka'))
  assert.equal(frame6.status, 'recognized')
  assert.equal(frame6.mudra, 'pataka')
  assert.equal(frame6.isNewRecognition, false, 'Subsequent identical frame must not re-trigger chime')
})

test('2. Hysteresis prevents flickering when encountering transient noise', () => {
  const stabilizer = new TemporalStabilizer({ windowSize: 8, consensusThreshold: 5, hysteresisHold: 3 })

  // Establish Pataka
  for (let i = 0; i < 5; i++) {
    stabilizer.update(mockRecognized('pataka'))
  }
  assert.equal(stabilizer.recognizedMudra, 'pataka')

  // Frame of transient noise / uncertain
  const noise1 = stabilizer.update(mockUncertain('Motion blur'))
  assert.equal(noise1.status, 'recognized', 'Single noisy frame should be absorbed by hysteresis')
  assert.equal(noise1.mudra, 'pataka')
  assert.equal(noise1.isNewRecognition, false)

  const noise2 = stabilizer.update(mockUncertain('Fingertip occluded'))
  assert.equal(noise2.status, 'recognized', 'Second noisy frame should still be held')
  assert.equal(noise2.mudra, 'pataka')

  // Hand stabilizes back to Pataka
  const back = stabilizer.update(mockRecognized('pataka'))
  assert.equal(back.status, 'recognized')
  assert.equal(back.mudra, 'pataka')
  assert.equal(back.isNewRecognition, false)
})

test('3. Drops recognized mudra after consecutive uncertainty exceeds hysteresis threshold', () => {
  const stabilizer = new TemporalStabilizer({ windowSize: 8, consensusThreshold: 4, hysteresisHold: 3 })

  // Establish Suchi
  for (let i = 0; i < 4; i++) {
    stabilizer.update(mockRecognized('suchi'))
  }
  assert.equal(stabilizer.recognizedMudra, 'suchi')

  // 1st uncertain frame (held)
  assert.equal(stabilizer.update(mockUncertain()).status, 'recognized')
  // 2nd uncertain frame (held)
  assert.equal(stabilizer.update(mockUncertain()).status, 'recognized')
  // 3rd uncertain frame (held)
  assert.equal(stabilizer.update(mockUncertain()).status, 'recognized')

  // 4th uncertain frame (exceeds hysteresisHold of 3 -> drops)
  const dropped = stabilizer.update(mockUncertain('Pose lost'))
  assert.equal(dropped.status, 'uncertain')
  assert.equal(stabilizer.recognizedMudra, null)
})

test('4. Immediate reset on no_hand (no hysteresis hold for missing hand)', () => {
  const stabilizer = new TemporalStabilizer({ windowSize: 8, consensusThreshold: 4 })

  // Establish Shikhara
  for (let i = 0; i < 4; i++) {
    stabilizer.update(mockRecognized('shikhara'))
  }
  assert.equal(stabilizer.recognizedMudra, 'shikhara')

  // Hand leaves camera view
  const noHandRes = stabilizer.update(mockNoHand())
  assert.equal(noHandRes.status, 'no_hand')
  assert.equal(stabilizer.recognizedMudra, null)
  assert.equal(noHandRes.isNewRecognition, false)

  // Next frame with single pose cannot immediately be recognized
  const nextFrame = stabilizer.update(mockRecognized('shikhara'))
  assert.equal(nextFrame.status, 'uncertain')
})

test('5. Clean transition from one mudra to another requires consensus and sets isNewRecognition', () => {
  const stabilizer = new TemporalStabilizer({ windowSize: 8, consensusThreshold: 5 })

  // Establish Pataka
  for (let i = 0; i < 5; i++) {
    stabilizer.update(mockRecognized('pataka'))
  }
  assert.equal(stabilizer.recognizedMudra, 'pataka')

  // Transitioning to Musti: needs 5 frames of Musti
  stabilizer.update(mockRecognized('musti'))
  stabilizer.update(mockRecognized('musti'))
  stabilizer.update(mockRecognized('musti'))
  stabilizer.update(mockRecognized('musti'))

  const switchFrame = stabilizer.update(mockRecognized('musti'))
  assert.equal(switchFrame.status, 'recognized')
  assert.equal(switchFrame.mudra, 'musti')
  assert.equal(switchFrame.isNewRecognition, true, 'Transition to new mudra must flag isNewRecognition')
})
