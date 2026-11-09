import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  MUDRA_AUDIO_MAP,
  getMudraAudioUrl,
  MudraAudioController,
} from '../hooks/use-mudra-audio.ts'
import { MUDRAS } from '../lib/mudras.ts'

// Mock audio factory for testing state transitions and audio lifecycle
function createMockAudioFactory() {
  const createdInstances = []

  const factory = (url) => {
    const instance = {
      url,
      currentTime: 0,
      playCount: 0,
      pauseCount: 0,
      isPlaying: false,
      shouldReject: false,
      play() {
        this.playCount++
        this.isPlaying = true
        if (this.shouldReject) {
          return Promise.reject(new Error('Playback rejected by browser autoplay policy'))
        }
        return Promise.resolve()
      },
      pause() {
        this.pauseCount++
        this.isPlaying = false
      },
    }
    createdInstances.push(instance)
    return instance
  }

  return { factory, createdInstances }
}

test('1. MUDRA_AUDIO_MAP contains all 10 canonical mudras with exact paths', () => {
  const canonicalIds = MUDRAS.map((m) => m.id)
  assert.equal(canonicalIds.length, 10, 'Expected exactly 10 canonical mudras')

  for (const id of canonicalIds) {
    const expectedPath = `/audio/${id}.mp3`
    assert.equal(
      MUDRA_AUDIO_MAP[id],
      expectedPath,
      `Expected ${id} to map to ${expectedPath}, got ${MUDRA_AUDIO_MAP[id]}`,
    )
    assert.equal(
      getMudraAudioUrl(id),
      expectedPath,
      `getMudraAudioUrl(${id}) should return ${expectedPath}`,
    )
  }
})

test('2. All 10 MP3 audio files exist in public/audio/ with non-zero size', () => {
  const audioDir = path.join(process.cwd(), 'public', 'audio')
  assert.ok(fs.existsSync(audioDir), 'public/audio directory must exist')

  for (const m of MUDRAS) {
    const filePath = path.join(audioDir, `${m.id}.mp3`)
    assert.ok(fs.existsSync(filePath), `Audio file for ${m.id} must exist at ${filePath}`)
    const stat = fs.statSync(filePath)
    assert.ok(stat.size > 1000, `Audio file for ${m.id} must be > 1KB (got ${stat.size} bytes)`)

    // Verify MP3 header (ID3 header: 0x49 0x44 0x33 = "ID3")
    const fd = fs.openSync(filePath, 'r')
    const buffer = Buffer.alloc(3)
    fs.readSync(fd, buffer, 0, 3, 0)
    fs.closeSync(fd)
    assert.equal(buffer.toString('ascii'), 'ID3', `File ${m.id}.mp3 must have valid ID3 header`)
  }
})

test('3. Sound OFF prevents audio playback', () => {
  const { factory, createdInstances } = createMockAudioFactory()
  const controller = new MudraAudioController({ audioFactory: factory })

  // When soundOn is false, recognition must NOT trigger playback
  controller.update('pataka', false)
  assert.equal(createdInstances.length, 0, 'No audio instance should be created when sound is OFF')
  assert.equal(controller.getState().currentAudio, null)
})

test('4. Sound ON enables pronunciation when a mudra is recognized', () => {
  const { factory, createdInstances } = createMockAudioFactory()
  const controller = new MudraAudioController({ audioFactory: factory })

  controller.update('pataka', true)

  assert.equal(createdInstances.length, 1, 'Audio instance should be created')
  assert.equal(createdInstances[0].url, '/audio/pataka.mp3')
  assert.equal(createdInstances[0].playCount, 1)
  assert.equal(controller.getState().lastPlayedMudra, 'pataka')
})

test('5. Holding one mudra does NOT repeatedly trigger audio', () => {
  const { factory, createdInstances } = createMockAudioFactory()
  const controller = new MudraAudioController({ audioFactory: factory })

  // First detection: plays
  controller.update('alapadma', true)
  assert.equal(createdInstances[0].playCount, 1)

  // Subsequent frames while holding the same mudra: must NOT replay
  controller.update('alapadma', true)
  controller.update('alapadma', true)
  controller.update('alapadma', true)

  assert.equal(createdInstances[0].playCount, 1, 'Audio should only play once while holding mudra')
})

test('6. Switching mudras stops previous audio and starts new audio', () => {
  const { factory, createdInstances } = createMockAudioFactory()
  const controller = new MudraAudioController({ audioFactory: factory })

  // Play mudra 1
  controller.update('pataka', true)
  const firstAudio = createdInstances[0]
  assert.equal(firstAudio.url, '/audio/pataka.mp3')
  assert.equal(firstAudio.playCount, 1)

  // Switch to mudra 2
  controller.update('tripataka', true)
  assert.equal(firstAudio.pauseCount, 1, 'Previous audio must be paused')
  assert.equal(firstAudio.currentTime, 0, 'Previous audio currentTime must be reset to 0')

  const secondAudio = createdInstances.find((a) => a.url === '/audio/tripataka.mp3')
  assert.ok(secondAudio, 'Second audio instance must exist')
  assert.equal(secondAudio.playCount, 1)
  assert.equal(controller.getState().lastPlayedMudra, 'tripataka')
})

test('7. Turning sound OFF immediately stops current playback', () => {
  const { factory, createdInstances } = createMockAudioFactory()
  const controller = new MudraAudioController({ audioFactory: factory })

  controller.update('mayura', true)
  const audio = createdInstances[0]
  assert.equal(audio.isPlaying, true)

  // Turn sound off
  controller.update('mayura', false)
  assert.equal(audio.pauseCount, 1)
  assert.equal(audio.currentTime, 0)
  assert.equal(controller.getState().currentAudio, null)
})

test('8. Cooldown prevents repeated pronunciation after brief tracking dropout', async () => {
  const { factory, createdInstances } = createMockAudioFactory()
  // Set 500ms cooldown for testing
  const controller = new MudraAudioController({ audioFactory: factory, cooldownMs: 500 })

  // Step 1: Detect 'shikhara' -> plays
  controller.update('shikhara', true)
  assert.equal(createdInstances[0].playCount, 1)

  // Step 2: Brief tracking drop to null (e.g. 50ms)
  controller.update(null, true)

  // Step 3: Re-detect 'shikhara' within cooldown window -> suppressed!
  controller.update('shikhara', true)
  assert.equal(
    createdInstances[0].playCount,
    1,
    'Re-trigger within cooldown window must be suppressed',
  )

  // Step 4: Wait for cooldown to expire (> 500ms)
  await new Promise((resolve) => setTimeout(resolve, 550))

  // Step 5: Brief drop and re-detect after cooldown -> plays!
  controller.update(null, true)
  controller.update('shikhara', true)
  assert.equal(
    createdInstances[0].playCount,
    2,
    'Re-trigger after cooldown expiry must play pronunciation',
  )
})

test('9. Rejected playback promises and errors are handled without crashing', () => {
  const { factory, createdInstances } = createMockAudioFactory()
  const controller = new MudraAudioController({ audioFactory: factory })

  // First call creates instance
  controller.update('musti', true)
  const audio = createdInstances[0]
  audio.shouldReject = true // simulate browser autoplay policy rejection

  // Must not throw when play() rejects
  assert.doesNotThrow(() => {
    controller.update(null, true)
    controller.update('suchi', true)
  })
})

test('10. Cleanup / dispose stops audio and resets controller', () => {
  const { factory, createdInstances } = createMockAudioFactory()
  const controller = new MudraAudioController({ audioFactory: factory })

  controller.update('mukula', true)
  const audio = createdInstances[0]
  assert.equal(audio.isPlaying, true)

  controller.dispose()
  assert.equal(audio.pauseCount, 1)
  assert.equal(controller.getState().currentAudio, null)
  assert.equal(controller.getState().lastPlayedMudra, null)
})
