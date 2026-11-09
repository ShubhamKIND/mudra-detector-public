import test from 'node:test'
import assert from 'node:assert/strict'

// Mock DOM and Web APIs to test useCamera lifecycle logic
class MockMediaStreamTrack {
  kind = 'video'
  readyState = 'live'
  onended = null
  stopCalled = false

  stop() {
    this.stopCalled = true
    this.readyState = 'ended'
  }

  // Simulate external disconnection (e.g. unplugging USB webcam)
  simulateDisconnect() {
    this.readyState = 'ended'
    if (typeof this.onended === 'function') {
      this.onended(new Event('ended'))
    }
  }
}

class MockMediaStream {
  tracks = []
  constructor(tracks = [new MockMediaStreamTrack()]) {
    this.tracks = tracks
  }
  getTracks() {
    return this.tracks
  }
  getVideoTracks() {
    return this.tracks.filter(t => t.kind === 'video')
  }
}

class MockVideoElement {
  srcObject = null
  readyState = 0 // HAVE_NOTHING
  paused = true
  muted = false
  defaultMuted = false
  listeners = {}

  addEventListener(event, handler, options) {
    if (!this.listeners[event]) this.listeners[event] = []
    this.listeners[event].push(handler)
  }

  removeEventListener(event, handler) {
    if (!this.listeners[event]) return
    this.listeners[event] = this.listeners[event].filter(h => h !== handler)
  }

  dispatchEvent(event) {
    const list = this.listeners[event.type] || []
    for (const handler of list) {
      handler(event)
    }
  }

  async play() {
    this.paused = false
  }

  pause() {
    this.paused = true
  }

  simulateLoadedMetadata() {
    this.readyState = 2 // HAVE_CURRENT_DATA / HAVE_METADATA
    this.dispatchEvent({ type: 'loadedmetadata' })
  }
}

// Build a clean test harness simulating useCamera logic directly
function createCameraHarness({ getUserMediaImpl } = {}) {
  let state = 'idle'
  const stateHistory = ['idle']
  const setState = (newState) => {
    state = newState
    stateHistory.push(newState)
  }

  const videoElement = new MockVideoElement()
  const videoRef = { current: videoElement }
  const streamRef = { current: null }
  const isStartingRef = { current: false }
  const isMountedRef = { current: true }
  const sessionRef = { current: 0 }

  const stopTracks = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.onended = null
        try {
          track.stop()
        } catch {
          // ignore
        }
      })
      streamRef.current = null
    }
    if (videoRef.current) {
      try {
        videoRef.current.pause()
      } catch {
        // ignore
      }
      videoRef.current.srcObject = null
    }
  }

  const stop = () => {
    sessionRef.current++
    stopTracks()
    if (isMountedRef.current) {
      setState('stopped')
    }
  }

  const defaultGetUserMedia = async () => {
    return new MockMediaStream()
  }

  const gum = getUserMediaImpl || defaultGetUserMedia

  const start = async () => {
    if (isStartingRef.current) return
    isStartingRef.current = true

    const sessionId = ++sessionRef.current

    stopTracks()
    setState('requesting')

    try {
      const stream = await gum()

      if (!isMountedRef.current || sessionRef.current !== sessionId) {
        stream.getTracks().forEach((track) => track.stop())
        isStartingRef.current = false
        return
      }

      streamRef.current = stream

      stream.getVideoTracks().forEach((track) => {
        track.onended = () => {
          stopTracks()
          if (isMountedRef.current) {
            setState('unavailable')
          }
        }
      })

      const video = videoRef.current
      if (video) {
        video.srcObject = stream

        await new Promise((resolve) => {
          if (video.readyState >= 1) {
            resolve()
            return
          }
          const timer = setTimeout(() => {
            cleanup()
            resolve()
          }, 50) // short timeout for test

          const onLoadedMetadata = () => {
            cleanup()
            resolve()
          }
          const cleanup = () => {
            clearTimeout(timer)
            video.removeEventListener('loadedmetadata', onLoadedMetadata)
          }
          video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true })
        })

        if (!isMountedRef.current || sessionRef.current !== sessionId) {
          stopTracks()
          isStartingRef.current = false
          return
        }

        try {
          await video.play()
        } catch {
          video.muted = true
          await video.play().catch(() => {})
        }
      }

      if (isMountedRef.current && sessionRef.current === sessionId) {
        setState('active')
      }
    } catch (err) {
      if (!isMountedRef.current || sessionRef.current !== sessionId) {
        isStartingRef.current = false
        return
      }

      stopTracks()

      if (typeof err === 'object' && err !== null && 'name' in err) {
        const errorName = err.name
        if (
          errorName === 'NotAllowedError' ||
          errorName === 'PermissionDeniedError' ||
          errorName === 'SecurityError'
        ) {
          setState('denied')
        } else if (
          errorName === 'NotFoundError' ||
          errorName === 'DevicesNotFoundError'
        ) {
          setState('no_camera')
        } else if (
          errorName === 'NotReadableError' ||
          errorName === 'TrackStartError' ||
          errorName === 'AbortError' ||
          errorName === 'OverconstrainedError'
        ) {
          setState('unavailable')
        } else {
          setState('unavailable')
        }
      } else {
        setState('unavailable')
      }
    } finally {
      isStartingRef.current = false
    }
  }

  const unmount = () => {
    isMountedRef.current = false
    stopTracks()
  }

  return {
    getState: () => state,
    getStateHistory: () => stateHistory,
    videoRef,
    streamRef,
    start,
    stop,
    unmount,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Cases
// ─────────────────────────────────────────────────────────────────────────────

test('1. Initial state is idle', () => {
  const harness = createCameraHarness()
  assert.equal(harness.getState(), 'idle')
})

test('2. Successful camera start transitions idle -> requesting -> active', async () => {
  const harness = createCameraHarness()
  const startPromise = harness.start()

  assert.equal(harness.getState(), 'requesting')
  
  // Trigger loadedmetadata
  harness.videoRef.current.simulateLoadedMetadata()
  await startPromise

  assert.equal(harness.getState(), 'active')
  assert.notEqual(harness.streamRef.current, null)
  assert.notEqual(harness.videoRef.current.srcObject, null)
  assert.equal(harness.videoRef.current.paused, false)
})

test('3. Stopping camera releases tracks, pauses video, sets stopped state', async () => {
  const harness = createCameraHarness()
  const startPromise = harness.start()
  harness.videoRef.current.simulateLoadedMetadata()
  await startPromise

  const activeStream = harness.streamRef.current
  const track = activeStream.getTracks()[0]
  assert.equal(track.stopCalled, false)

  // Call stop
  harness.stop()

  assert.equal(harness.getState(), 'stopped')
  assert.equal(track.stopCalled, true)
  assert.equal(harness.streamRef.current, null)
  assert.equal(harness.videoRef.current.srcObject, null)
  assert.equal(harness.videoRef.current.paused, true)
})

test('4. Restarting camera from stopped state requests stream and reaches active', async () => {
  const harness = createCameraHarness()
  
  // Start then stop
  const p1 = harness.start()
  harness.videoRef.current.simulateLoadedMetadata()
  await p1
  harness.stop()
  assert.equal(harness.getState(), 'stopped')

  // Restart
  const p2 = harness.start()
  assert.equal(harness.getState(), 'requesting')
  harness.videoRef.current.simulateLoadedMetadata()
  await p2

  assert.equal(harness.getState(), 'active')
  assert.notEqual(harness.streamRef.current, null)
  assert.equal(harness.videoRef.current.paused, false)
})

test('5. Permission denied (NotAllowedError) transitions requesting -> denied', async () => {
  const harness = createCameraHarness({
    getUserMediaImpl: async () => {
      const err = new Error('Permission denied')
      err.name = 'NotAllowedError'
      throw err
    },
  })

  await harness.start()
  assert.equal(harness.getState(), 'denied')
  assert.equal(harness.streamRef.current, null)
})

test('6. Retry works after permission denied is resolved', async () => {
  let shouldDeny = true
  const harness = createCameraHarness({
    getUserMediaImpl: async () => {
      if (shouldDeny) {
        const err = new Error('Permission denied')
        err.name = 'NotAllowedError'
        throw err
      }
      return new MockMediaStream()
    },
  })

  // First attempt: denied
  await harness.start()
  assert.equal(harness.getState(), 'denied')

  // User allows in settings and clicks Try Again
  shouldDeny = false
  const p = harness.start()
  assert.equal(harness.getState(), 'requesting')
  harness.videoRef.current.simulateLoadedMetadata()
  await p

  assert.equal(harness.getState(), 'active')
})

test('7. No camera found (NotFoundError) transitions to no_camera', async () => {
  const harness = createCameraHarness({
    getUserMediaImpl: async () => {
      const err = new Error('Requested device not found')
      err.name = 'NotFoundError'
      throw err
    },
  })

  await harness.start()
  assert.equal(harness.getState(), 'no_camera')
})

test('8. Hardware busy / in use (NotReadableError) transitions to unavailable', async () => {
  const harness = createCameraHarness({
    getUserMediaImpl: async () => {
      const err = new Error('Could not start video source')
      err.name = 'NotReadableError'
      throw err
    },
  })

  await harness.start()
  assert.equal(harness.getState(), 'unavailable')
})

test('9. External device disconnection (track onended) transitions active -> unavailable and stops tracks', async () => {
  const harness = createCameraHarness()
  const p = harness.start()
  harness.videoRef.current.simulateLoadedMetadata()
  await p
  assert.equal(harness.getState(), 'active')

  const track = harness.streamRef.current.getVideoTracks()[0]
  track.simulateDisconnect()

  assert.equal(harness.getState(), 'unavailable')
  assert.equal(harness.streamRef.current, null)
  assert.equal(harness.videoRef.current.srcObject, null)
})

test('10. Concurrent start() calls are ignored (no duplicate streams)', async () => {
  let gumCalls = 0
  const harness = createCameraHarness({
    getUserMediaImpl: async () => {
      gumCalls++
      await new Promise(r => setTimeout(r, 20))
      return new MockMediaStream()
    },
  })

  const p1 = harness.start()
  const p2 = harness.start() // duplicate call
  const p3 = harness.start() // duplicate call

  harness.videoRef.current.simulateLoadedMetadata()
  await Promise.all([p1, p2, p3])

  assert.equal(gumCalls, 1, 'getUserMedia was called exactly once')
  assert.equal(harness.getState(), 'active')
})

test('11. Calling stop() while start() is pending discards stream and keeps state stopped', async () => {
  let resolveGum
  const harness = createCameraHarness({
    getUserMediaImpl: () =>
      new Promise((resolve) => {
        resolveGum = resolve
      }),
  })

  const startPromise = harness.start()
  assert.equal(harness.getState(), 'requesting')

  // User cancels/stops while getUserMedia is pending
  harness.stop()
  assert.equal(harness.getState(), 'stopped')

  // Now getUserMedia resolves with a stream
  const lateStream = new MockMediaStream()
  resolveGum(lateStream)
  await startPromise

  // State must remain stopped!
  assert.equal(harness.getState(), 'stopped')
  // The late stream tracks must have been stopped
  assert.equal(lateStream.getTracks()[0].stopCalled, true)
  assert.equal(harness.streamRef.current, null)
})

test('12. Component unmount while start() is pending discards stream and avoids state update', async () => {
  let resolveGum
  const harness = createCameraHarness({
    getUserMediaImpl: () =>
      new Promise((resolve) => {
        resolveGum = resolve
      }),
  })

  const startPromise = harness.start()
  assert.equal(harness.getState(), 'requesting')

  // Component unmounts
  harness.unmount()

  const lateStream = new MockMediaStream()
  resolveGum(lateStream)
  await startPromise

  // The stream tracks were terminated
  assert.equal(lateStream.getTracks()[0].stopCalled, true)
  assert.equal(harness.streamRef.current, null)
})
