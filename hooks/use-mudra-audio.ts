'use client'

import { useEffect, useRef } from 'react'
import type { MudraId } from '@/lib/mudras.ts'

/**
 * Canonical mapping from MudraId to public MP3 asset path.
 * In Next.js, static assets in `public/audio/` are served at `/audio/`.
 */
export const MUDRA_AUDIO_MAP: Record<MudraId, string> = {
  alapadma: '/audio/alapadma.mp3',
  ardhachandra: '/audio/ardhachandra.mp3',
  ardhapataka: '/audio/ardhapataka.mp3',
  mayura: '/audio/mayura.mp3',
  mukula: '/audio/mukula.mp3',
  musti: '/audio/musti.mp3',
  pataka: '/audio/pataka.mp3',
  shikhara: '/audio/shikhara.mp3',
  suchi: '/audio/suchi.mp3',
  tripataka: '/audio/tripataka.mp3',
}

/**
 * Returns the public URL path for a given mudra pronunciation audio file.
 */
export function getMudraAudioUrl(id: MudraId): string {
  return MUDRA_AUDIO_MAP[id]
}

/**
 * Minimal interface compatible with HTMLAudioElement for testability in Node.
 */
export interface AudioInstance {
  currentTime: number
  play(): Promise<void> | void
  pause(): void
  src?: string
}

export type MudraAudioControllerOptions = {
  /**
   * Cooldown window in milliseconds preventing accidental repeated pronunciation
   * of the same mudra after brief tracking dropouts. Default: 1800ms.
   */
  cooldownMs?: number
  /**
   * Optional custom factory for creating audio instances (useful for testing or custom audio backends).
   */
  audioFactory?: (url: string) => AudioInstance
}

/**
 * Dedicated Mudra Audio Controller.
 * Manages audio instances, tracks playback state, prevents overlapping playback,
 * enforces hold suppression and re-trigger cooldowns, and gracefully handles
 * browser autoplay restrictions and decoding errors.
 */
export class MudraAudioController {
  private readonly cooldownMs: number
  private readonly audioFactory: (url: string) => AudioInstance
  private audioCache = new Map<MudraId, AudioInstance>()

  private currentAudio: AudioInstance | null = null
  private prevMudra: MudraId | null = null
  private lastPlayedMudra: MudraId | null = null
  private lastPlayedTime = 0
  private soundOn = false

  constructor(options?: MudraAudioControllerOptions) {
    this.cooldownMs = options?.cooldownMs ?? 1800
    this.audioFactory =
      options?.audioFactory ??
      ((url: string) => {
        if (typeof Audio !== 'undefined') {
          const el = new Audio(url)
          el.preload = 'auto'
          return el
        }
        return {
          currentTime: 0,
          play: () => Promise.resolve(),
          pause: () => {},
        }
      })
  }

  /**
   * Retrieves or instantiates the cached audio element for a mudra.
   */
  public getAudio(id: MudraId): AudioInstance | null {
    let audio = this.audioCache.get(id)
    if (!audio) {
      const url = MUDRA_AUDIO_MAP[id]
      if (!url) return null
      try {
        audio = this.audioFactory(url)
        this.audioCache.set(id, audio)
      } catch (err) {
        console.warn(`[MudraAudio] Failed to create audio instance for "${id}":`, err)
        return null
      }
    }
    return audio
  }

  /**
   * Immediately stops and resets any currently playing audio clip.
   */
  public stopCurrent(): void {
    if (this.currentAudio) {
      try {
        this.currentAudio.pause()
        this.currentAudio.currentTime = 0
      } catch (err) {
        console.warn('[MudraAudio] Error pausing current audio:', err)
      }
      this.currentAudio = null
    }
  }

  /**
   * Updates the audio controller with the latest recognition state.
   *
   * @param mudraId - Recognized MudraId or null if no mudra is recognized.
   * @param soundOn - Master sound toggle (true = enabled, false = muted).
   */
  public update(mudraId: MudraId | null, soundOn: boolean): void {
    const prevSoundOn = this.soundOn
    this.soundOn = soundOn

    // 1. If sound is OFF: immediately stop current playback and do nothing else
    if (!soundOn) {
      if (prevSoundOn) {
        this.stopCurrent()
      }
      this.prevMudra = mudraId
      return
    }

    // 2. If sound was just turned ON and a mudra is currently active, allow it to pronounce
    const soundJustEnabled = !prevSoundOn && soundOn

    // 3. If no mudra is recognized: reset active tracking, keep last played timestamp
    if (!mudraId) {
      this.prevMudra = null
      return
    }

    // 4. Do not replay audio continuously while the user holds the same mudra
    if (mudraId === this.prevMudra && !soundJustEnabled) {
      return
    }

    // 5. Cooldown check: if the user rapidly re-enters the SAME mudra after a brief
    // tracking interruption (within cooldownMs), suppress the repeated trigger
    const now = Date.now()
    if (
      mudraId === this.lastPlayedMudra &&
      now - this.lastPlayedTime < this.cooldownMs &&
      !soundJustEnabled
    ) {
      this.prevMudra = mudraId
      return
    }

    // 6. Valid new recognition: stop any previous audio before starting new playback
    this.stopCurrent()

    const audio = this.getAudio(mudraId)
    if (!audio) {
      this.prevMudra = mudraId
      return
    }

    try {
      audio.currentTime = 0
      const playPromise = audio.play()

      if (playPromise !== undefined && typeof playPromise.catch === 'function') {
        playPromise.catch((err: unknown) => {
          // Normal abort if interrupted by subsequent navigation/toggle
          if (err instanceof Error && err.name === 'AbortError') {
            return
          }
          // Autoplay policy or loading rejection: log warning without crashing
          console.warn(`[MudraAudio] Playback prevented for "${mudraId}":`, err)
        })
      }

      this.currentAudio = audio
      this.lastPlayedMudra = mudraId
      this.lastPlayedTime = now
      this.prevMudra = mudraId
    } catch (err) {
      console.warn(`[MudraAudio] Unexpected error playing "${mudraId}":`, err)
      this.prevMudra = mudraId
    }
  }

  /**
   * Current playback state diagnostics (for tests and inspection).
   */
  public getState(): {
    soundOn: boolean
    currentAudio: AudioInstance | null
    lastPlayedMudra: MudraId | null
    lastPlayedTime: number
    prevMudra: MudraId | null
  } {
    return {
      soundOn: this.soundOn,
      currentAudio: this.currentAudio,
      lastPlayedMudra: this.lastPlayedMudra,
      lastPlayedTime: this.lastPlayedTime,
      prevMudra: this.prevMudra,
    }
  }

  /**
   * Cleans up all audio instances and resets controller state.
   */
  public dispose(): void {
    this.stopCurrent()
    for (const audio of this.audioCache.values()) {
      try {
        if ('src' in audio) {
          audio.src = ''
        }
      } catch {
        // Ignored during disposal
      }
    }
    this.audioCache.clear()
    this.prevMudra = null
    this.lastPlayedMudra = null
    this.lastPlayedTime = 0
  }
}

/**
 * React hook connecting stabilized mudra recognition to MP3 pronunciation audio.
 *
 * @param mudraId - Recognized mudra ID or null.
 * @param soundOn - Whether audio is enabled in header controls.
 * @param options - Optional configuration (cooldownMs, custom audioFactory).
 */
export function useMudraAudio(
  mudraId: MudraId | null,
  soundOn: boolean,
  options?: MudraAudioControllerOptions,
): void {
  const controllerRef = useRef<MudraAudioController | null>(null)

  if (!controllerRef.current) {
    controllerRef.current = new MudraAudioController(options)
  }

  // Update controller on state changes
  useEffect(() => {
    controllerRef.current?.update(mudraId, soundOn)
  }, [mudraId, soundOn])

  // Lifecycle cleanup on unmount
  useEffect(() => {
    return () => {
      controllerRef.current?.dispose()
      controllerRef.current = null
    }
  }, [])
}
