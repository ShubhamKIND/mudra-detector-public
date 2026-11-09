import test from 'node:test'
import assert from 'node:assert/strict'
import {
  transformLandmarkToScreen,
  computeWristBadgePosition,
  BadgePositionSmoother,
} from '../lib/camera-transform.ts'

test('1. Center landmark (0.5, 0.5) always maps to container center', () => {
  // Wide container (1920x1080) with 1280x720 video (same 16:9 ratio)
  const p1 = transformLandmarkToScreen({ x: 0.5, y: 0.5 }, 1280, 720, 1920, 1080, true)
  assert.equal(Math.round(p1.x), 960)
  assert.equal(Math.round(p1.y), 540)

  // Extra wide container (2000x800) with 1280x720 video (ratio 2.5 vs 1.777)
  const p2 = transformLandmarkToScreen({ x: 0.5, y: 0.5 }, 1280, 720, 2000, 800, true)
  assert.equal(Math.round(p2.x), 1000)
  assert.equal(Math.round(p2.y), 400)

  // Tall mobile container (400x900) with 1280x720 video (ratio 0.444 vs 1.777)
  const p3 = transformLandmarkToScreen({ x: 0.5, y: 0.5 }, 1280, 720, 400, 900, true)
  assert.equal(Math.round(p3.x), 200)
  assert.equal(Math.round(p3.y), 450)
})

test('2. Mirroring flips x correctly', () => {
  // x = 0 (left of camera sensor) should appear at right of screen when mirrored
  const pMirrored = transformLandmarkToScreen({ x: 0, y: 0.5 }, 1280, 720, 1280, 720, true)
  assert.equal(Math.round(pMirrored.x), 1280)

  // x = 0 without mirroring should appear at left of screen
  const pUnmirrored = transformLandmarkToScreen({ x: 0, y: 0.5 }, 1280, 720, 1280, 720, false)
  assert.equal(Math.round(pUnmirrored.x), 0)
})

test('3. Corner landmarks map within bounds for matching aspect ratio', () => {
  const topLeft = transformLandmarkToScreen({ x: 0, y: 0 }, 1280, 720, 1280, 720, false)
  assert.equal(Math.round(topLeft.x), 0)
  assert.equal(Math.round(topLeft.y), 0)

  const bottomRight = transformLandmarkToScreen({ x: 1, y: 1 }, 1280, 720, 1280, 720, false)
  assert.equal(Math.round(bottomRight.x), 1280)
  assert.equal(Math.round(bottomRight.y), 720)
})

// Helper: minimal realistic wrist (0) + middle MCP (9) landmarks pointing upward
function makeMockLandmarks(wristX = 0.5, wristY = 0.7) {
  const lm = Array.from({ length: 21 }, (_, i) => ({ x: wristX, y: wristY, z: 0 }))
  lm[0] = { x: wristX, y: wristY, z: 0 }
  lm[9] = { x: wristX, y: wristY - 0.15, z: 0 } // middle MCP above wrist
  return lm
}

test('4. computeWristBadgePosition returns null for missing/degenerate inputs', () => {
  assert.equal(computeWristBadgePosition(null, 1280, 720, 1920, 1080), null)
  assert.equal(computeWristBadgePosition([], 1280, 720, 1920, 1080), null)
  assert.equal(computeWristBadgePosition(makeMockLandmarks(), 0, 720, 1920, 1080), null)
  assert.equal(computeWristBadgePosition(makeMockLandmarks(), 1280, 0, 1920, 1080), null)
  assert.equal(computeWristBadgePosition(makeMockLandmarks(), 1280, 720, 0, 1080), null)
  assert.equal(computeWristBadgePosition(makeMockLandmarks(), 1280, 720, 1920, 0), null)
})

test('5. computeWristBadgePosition returns finite coords for valid landmarks', () => {
  const lm = makeMockLandmarks(0.5, 0.7)
  const pos = computeWristBadgePosition(lm, 1280, 720, 1920, 1080, true)
  assert.ok(pos !== null)
  assert.ok(Number.isFinite(pos.x), 'x must be finite')
  assert.ok(Number.isFinite(pos.y), 'y must be finite')
  assert.ok(pos.x > 0 && pos.x < 1920, `x ${pos.x} should be within container width`)
  assert.ok(pos.y > 0 && pos.y < 1080, `y ${pos.y} should be within container height`)
})

test('6. computeWristBadgePosition moves right when wrist moves right', () => {
  const leftLm = makeMockLandmarks(0.3, 0.7)
  const rightLm = makeMockLandmarks(0.7, 0.7)
  // Mirrored: x=0.3 maps to screen-right (larger x), x=0.7 maps to screen-left (smaller x)
  const leftPos = computeWristBadgePosition(leftLm, 1280, 720, 1920, 1080, true)
  const rightPos = computeWristBadgePosition(rightLm, 1280, 720, 1920, 1080, true)
  assert.ok(leftPos && rightPos)
  // With mirroring: smaller sensor-x → larger screen-x
  assert.ok(leftPos.x > rightPos.x, `mirrored: left-sensor x ${leftPos.x} should be right on screen vs ${rightPos.x}`)
})

test('7. computeWristBadgePosition moves down when wrist moves down', () => {
  const highLm = makeMockLandmarks(0.5, 0.3)
  const lowLm = makeMockLandmarks(0.5, 0.7)
  const highPos = computeWristBadgePosition(highLm, 1280, 720, 1920, 1080, true)
  const lowPos = computeWristBadgePosition(lowLm, 1280, 720, 1920, 1080, true)
  assert.ok(highPos && lowPos)
  assert.ok(lowPos.y > highPos.y, `low-wrist badge (${lowPos.y}) should be below high-wrist (${highPos.y})`)
})

test('8. computeWristBadgePosition clamps badge within container bounds', () => {
  // Extreme edge position
  const edgeLm = makeMockLandmarks(0.0, 0.0)
  const pos = computeWristBadgePosition(edgeLm, 1280, 720, 1920, 1080, true, 130, 36)
  assert.ok(pos !== null)
  assert.ok(pos.x >= 12 + 65, `x ${pos.x} must be clamped away from left edge`)
  assert.ok(pos.y >= 12 + 18, `y ${pos.y} must be clamped away from top edge`)
  assert.ok(pos.x <= 1920 - 65 - 12, `x ${pos.x} must not exceed right boundary`)
  assert.ok(pos.y <= 1080 - 18 - 12, `y ${pos.y} must not exceed bottom boundary`)
})

test('9. BadgePositionSmoother: snaps on first position, smooths subsequent', () => {
  const smoother = new BadgePositionSmoother(0.5)
  // First position: should snap exactly
  const p1 = smoother.update({ x: 100, y: 200 })
  assert.ok(p1)
  assert.equal(p1.x, 100)
  assert.equal(p1.y, 200)

  // Second position: should interpolate (alpha 0.5 → midpoint)
  const p2 = smoother.update({ x: 200, y: 300 })
  assert.ok(p2)
  assert.ok(p2.x > 100 && p2.x < 200, `x ${p2.x} should be between 100 and 200`)
  assert.ok(p2.y > 200 && p2.y < 300, `y ${p2.y} should be between 200 and 300`)
})

test('10. BadgePositionSmoother: returns null and resets on null input', () => {
  const smoother = new BadgePositionSmoother(0.5)
  smoother.update({ x: 100, y: 200 })
  const afterNull = smoother.update(null)
  assert.equal(afterNull, null)
  // After reset, next position should snap again
  const afterReset = smoother.update({ x: 400, y: 500 })
  assert.ok(afterReset)
  assert.equal(afterReset.x, 400)
  assert.equal(afterReset.y, 500)
})

test('11. BadgePositionSmoother: snaps on large position jump (> 320px)', () => {
  const smoother = new BadgePositionSmoother(0.1) // very slow alpha
  smoother.update({ x: 100, y: 100 })
  // Jump 500px away — should snap directly
  const jumped = smoother.update({ x: 700, y: 700 })
  assert.ok(jumped)
  assert.equal(jumped.x, 700)
  assert.equal(jumped.y, 700)
})
