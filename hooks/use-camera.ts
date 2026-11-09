'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * All supported camera lifecycle states:
 * - 'idle': Initial state before camera has been requested.
 * - 'requesting': Browser is requesting permission / initializing device.
 * - 'active': Permission granted, stream attached, and video is actively playing.
 * - 'denied': User or browser rejected camera permission (NotAllowedError).
 * - 'no_camera': No video input device found on the system (NotFoundError).
 * - 'unavailable': Device in use by another app, hardware fault, or track ended (NotReadableError).
 * - 'unsupported': MediaDevices API missing or insecure context (non-HTTPS).
 * - 'stopped': User manually turned camera off; can be restarted.
 */
export type CameraState =
  | 'idle'
  | 'requesting'
  | 'active'
  | 'denied'
  | 'no_camera'
  | 'unavailable'
  | 'unsupported'
  | 'stopped'

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const isStartingRef = useRef(false)
  const isMountedRef = useRef(true)
  const sessionRef = useRef(0)

  const [state, setState] = useState<CameraState>('idle')

  /**
   * Helper to safely stop all media tracks and detach from the video element.
   * Clears track listeners before stopping to avoid re-entrant event triggers.
   */
  const stopTracks = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.onended = null
        try {
          track.stop()
        } catch {
          // Ignore errors on stopping already terminated tracks
        }
      })
      streamRef.current = null
    }

    if (videoRef.current) {
      try {
        videoRef.current.pause()
      } catch {
        // Ignore pause errors
      }
      videoRef.current.srcObject = null
    }
  }, [])

  /**
   * Stops the camera manually and sets state to 'stopped'.
   * Advances session ID so any in-flight start() request is cancelled.
   */
  const stop = useCallback(() => {
    sessionRef.current++
    stopTracks()
    if (isMountedRef.current) {
      setState('stopped')
    }
  }, [stopTracks])

  /**
   * Starts or restarts the camera stream.
   * Handles cleanup of prior streams, waits for video metadata & playback,
   * listens for device disconnection, and categorizes errors cleanly.
   */
  const start = useCallback(async () => {
    // Prevent duplicate concurrent requests
    if (isStartingRef.current) return
    isStartingRef.current = true

    const sessionId = ++sessionRef.current

    // Check browser support and secure context
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      (typeof window !== 'undefined' && window.isSecureContext === false)
    ) {
      isStartingRef.current = false
      setState('unsupported')
      return
    }

    // Clean up any stale streams before requesting a new one
    stopTracks()
    setState('requesting')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })

      // If component unmounted or stop() was called while awaiting permission, abort
      if (!isMountedRef.current || sessionRef.current !== sessionId) {
        stream.getTracks().forEach((track) => track.stop())
        isStartingRef.current = false
        return
      }

      streamRef.current = stream

      // Listen for camera disconnection or external revocation
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
        video.defaultMuted = true
        video.muted = true
        video.srcObject = stream

        // Wait for video metadata with timeout safety
        await new Promise<void>((resolve) => {
          if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
            resolve()
            return
          }
          const timer = setTimeout(() => {
            cleanupListeners()
            resolve()
          }, 3500)
          const onLoadedMetadata = () => {
            cleanupListeners()
            resolve()
          }
          const onError = () => {
            cleanupListeners()
            resolve()
          }
          const cleanupListeners = () => {
            clearTimeout(timer)
            video.removeEventListener('loadedmetadata', onLoadedMetadata)
            video.removeEventListener('error', onError)
          }
          video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true })
          video.addEventListener('error', onError, { once: true })
        })

        // Verify session is still valid before playing
        if (!isMountedRef.current || sessionRef.current !== sessionId) {
          stopTracks()
          isStartingRef.current = false
          return
        }

        // Start playback and handle autoplay restrictions gracefully
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
    } catch (err: unknown) {
      if (!isMountedRef.current || sessionRef.current !== sessionId) {
        isStartingRef.current = false
        return
      }

      stopTracks()

      // Differentiate errors accurately
      if (typeof err === 'object' && err !== null && 'name' in err) {
        const errorName = (err as { name: string }).name
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
  }, [stopTracks])

  // Component unmount cleanup
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      sessionRef.current++
      stopTracks()
    }
  }, [stopTracks])

  return {
    videoRef,
    state,
    start,
    stop,
    retry: start,
  }
}
