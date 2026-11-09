import test from 'node:test'
import assert from 'node:assert/strict'
import { transformLandmarkToScreen } from '../lib/camera-transform.ts'
import { HAND_CONNECTIONS } from '../lib/mudras.ts'

test('1. HAND_CONNECTIONS has exactly 21 valid MediaPipe edges', () => {
  assert.equal(HAND_CONNECTIONS.length, 21)
  for (const [a, b] of HAND_CONNECTIONS) {
    assert.ok(a >= 0 && a <= 20, `Index ${a} is out of bounds`)
    assert.ok(b >= 0 && b <= 20, `Index ${b} is out of bounds`)
    assert.notEqual(a, b, 'Self-connections are invalid')
  }
})

test('2. 21 mock landmarks transform without NaN or Infinity', () => {
  // Generate 21 sample landmarks in normalized space
  const sampleLandmarks = Array.from({ length: 21 }).map((_, i) => ({
    x: 0.1 + (i % 5) * 0.15,
    y: 0.2 + Math.floor(i / 5) * 0.15,
    z: 0.0,
  }))

  const containerW = 1440
  const containerH = 900
  const videoW = 1280
  const videoH = 720

  const screenPoints = sampleLandmarks.map((lm) =>
    transformLandmarkToScreen(lm, videoW, videoH, containerW, containerH, true),
  )

  assert.equal(screenPoints.length, 21)
  for (const p of screenPoints) {
    assert.ok(!Number.isNaN(p.x), 'Transformed x is NaN')
    assert.ok(!Number.isNaN(p.y), 'Transformed y is NaN')
    assert.ok(Number.isFinite(p.x), 'Transformed x is not finite')
    assert.ok(Number.isFinite(p.y), 'Transformed y is not finite')
  }
})

test('3. MediaPipe model asset and WASM files exist on disk with valid file size', async () => {
  const fs = await import('node:fs')
  const path = await import('node:path')

  const modelPath = path.resolve('public/models/hand_landmarker.task')
  const wasmPath = path.resolve('public/wasm/vision_wasm_internal.wasm')

  assert.ok(fs.existsSync(modelPath), 'hand_landmarker.task must exist in public/models')
  assert.ok(fs.existsSync(wasmPath), 'vision_wasm_internal.wasm must exist in public/wasm')

  const modelStat = fs.statSync(modelPath)
  const wasmStat = fs.statSync(wasmPath)

  assert.ok(modelStat.size > 5_000_000, `Model size should be > 5MB, got ${modelStat.size}`)
  assert.ok(wasmStat.size > 10_000_000, `WASM size should be > 10MB, got ${wasmStat.size}`)
})

test('4. drawHandSkeleton safely clears canvas and draws without DOM exceptions', async () => {
  const { drawHandSkeleton } = await import('../lib/camera-transform.ts')

  // Mock minimal canvas and 2D context
  let clearRectCalls = 0
  let strokeCalls = 0
  let arcCalls = 0

  const mockCtx = {
    save: () => {},
    restore: () => {},
    scale: () => {},
    clearRect: () => { clearRectCalls++ },
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => { strokeCalls++ },
    fill: () => {},
    arc: () => { arcCalls++ },
    lineWidth: 1,
    lineCap: 'round',
    lineJoin: 'round',
    strokeStyle: '',
    fillStyle: '',
    shadowBlur: 0,
    shadowColor: '',
  }

  const mockCanvas = {
    width: 1280,
    height: 720,
    getBoundingClientRect: () => ({ width: 1280, height: 720 }),
    getContext: () => mockCtx,
  }

  const mockVideo = {
    videoWidth: 1280,
    videoHeight: 720,
  }

  // 1. Calling with null landmarks should clear canvas and return
  drawHandSkeleton(mockCanvas, mockVideo, null, false)
  assert.equal(clearRectCalls, 1)
  assert.equal(strokeCalls, 0)

  // 2. Calling with 21 landmarks draws bones and joints
  const sampleLandmarks = Array.from({ length: 21 }).map((_, i) => ({
    x: 0.2 + (i % 5) * 0.1,
    y: 0.3 + Math.floor(i / 5) * 0.1,
  }))

  drawHandSkeleton(mockCanvas, mockVideo, sampleLandmarks, true)
  assert.equal(clearRectCalls, 2)
  assert.equal(strokeCalls, 21, 'Must stroke all 21 hand connection edges')
  assert.equal(arcCalls, 21, 'Must draw 21 joints and fingertip points')
})
