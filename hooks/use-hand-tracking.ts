'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import type { CameraState } from '@/hooks/use-camera'
import { drawHandSkeleton } from '@/lib/camera-transform'

export type NormalizedLandmark = {
  x: number
  y: number
  z: number
}

export type HandTrackingStatus =
  | 'idle'
  | 'loading_model'
  | 'ready'
  | 'hand_detected'
  | 'no_hand'
  | 'error'

export type HandednessInfo = {
  label: 'Left' | 'Right'
  score: number
}

export type HandTrackingState = {
  status: HandTrackingStatus
  isModelLoading: boolean
  isModelReady: boolean
  modelError: string | null
  handDetected: boolean
  landmarks: NormalizedLandmark[] | null
  landmarksRef?: RefObject<NormalizedLandmark[] | null>
  handedness?: HandednessInfo | null
  handednessRef?: RefObject<HandednessInfo | null>
}

export type UseHandTrackingOptions = {
  videoRef: RefObject<HTMLVideoElement | null>
  canvasRef?: RefObject<HTMLCanvasElement | null>
  cameraState: CameraState
  isRecognised?: boolean
  onFrame?: (landmarks: NormalizedLandmark[] | null, handedness?: HandednessInfo | null) => void
}

/**
 * Custom hook that integrates Google MediaPipe Tasks Vision HandLandmarker.
 * - Reuses the existing video element from useCamera.
 * - Loads WebAssembly and model assets locally with CDN fallback.
 * - Runs a throttled inference loop (~30 FPS) only while camera is active.
 * - Draws directly to canvas overlay without React state updates.
 * - Separates high-frequency landmark data (refs) from low-frequency UI state (state transitions only).
 * - Avoids React infinite update loops.
 */
export function useHandTracking({
  videoRef,
  canvasRef,
  cameraState,
  isRecognised,
  onFrame,
}: UseHandTrackingOptions): HandTrackingState {
  const [state, setState] = useState<HandTrackingState>({
    status: 'idle',
    isModelLoading: false,
    isModelReady: false,
    modelError: null,
    handDetected: false,
    landmarks: null,
  })

  // References to keep loop state without unnecessary re-renders
  const landmarkerRef = useRef<any>(null)
  const animFrameIdRef = useRef<number | null>(null)
  const isInitializingRef = useRef(false)
  const lastInferenceTimeRef = useRef(0)
  const isMountedRef = useRef(true)

  // Stable references for rapidly updating per-frame callbacks and inputs
  const onFrameRef = useRef(onFrame)
  onFrameRef.current = onFrame

  const isRecognisedRef = useRef(isRecognised)
  isRecognisedRef.current = isRecognised

  const canvasRefRef = useRef(canvasRef)
  canvasRefRef.current = canvasRef

  const landmarksRef = useRef<NormalizedLandmark[] | null>(null)
  const handednessRef = useRef<HandednessInfo | null>(null)
  const prevHandDetectedRef = useRef(false)

  // 1. Initialize MediaPipe HandLandmarker when camera becomes active
  useEffect(() => {
    isMountedRef.current = true

    if (cameraState !== 'active') {
      // Camera is not active — cancel any running loop and reset detection state
      if (animFrameIdRef.current !== null) {
        cancelAnimationFrame(animFrameIdRef.current)
        animFrameIdRef.current = null
      }
      landmarksRef.current = null
      prevHandDetectedRef.current = false

      const canvas = canvasRefRef.current?.current
      const video = videoRef.current
      if (canvas && video) {
        drawHandSkeleton(canvas, video, null, false)
      }

      setState((prev) => ({
        ...prev,
        status: prev.isModelReady ? 'ready' : 'idle',
        handDetected: false,
        landmarks: null,
      }))
      return
    }

    let isCancelled = false

    async function initDetector() {
      // If already created or currently loading, skip
      if (landmarkerRef.current || isInitializingRef.current) return
      isInitializingRef.current = true

      if (isMountedRef.current) {
        setState((prev) => ({
          ...prev,
          status: 'loading_model',
          isModelLoading: true,
          modelError: null,
        }))
      }

      try {
        // Dynamic import to prevent any SSR / Node execution issues
        const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision')

        if (isCancelled || !isMountedRef.current) return

        // 1. Load WASM files: try local /wasm first, fallback to jsdelivr CDN
        let vision: any
        try {
          vision = await FilesetResolver.forVisionTasks('/wasm')
        } catch {
          vision = await FilesetResolver.forVisionTasks(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2/wasm',
          )
        }

        if (isCancelled || !isMountedRef.current) return

        // 2. Load model: try local model with GPU delegate, fallback to CPU / CDN
        let landmarker: any
        try {
          landmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: '/models/hand_landmarker.task',
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numHands: 1,
            minHandDetectionConfidence: 0.4,
            minHandPresenceConfidence: 0.4,
            minTrackingConfidence: 0.4,
          })
        } catch {
          // Fallback to CPU delegate or CDN URL if GPU is unavailable
          landmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath:
                'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
              delegate: 'CPU',
            },
            runningMode: 'VIDEO',
            numHands: 1,
            minHandDetectionConfidence: 0.4,
            minHandPresenceConfidence: 0.4,
            minTrackingConfidence: 0.4,
          })
        }

        if (isCancelled || !isMountedRef.current) {
          try {
            landmarker.close()
          } catch {
            // ignore
          }
          return
        }

        landmarkerRef.current = landmarker

        setState((prev) => ({
          ...prev,
          status: 'ready',
          isModelLoading: false,
          isModelReady: true,
          modelError: null,
        }))
      } catch (err: unknown) {
        if (isCancelled || !isMountedRef.current) return
        const msg = err instanceof Error ? err.message : 'Failed to initialize hand detector'
        setState((prev) => ({
          ...prev,
          status: 'error',
          isModelLoading: false,
          isModelReady: false,
          modelError: msg,
        }))
      } finally {
        isInitializingRef.current = false
      }
    }

    initDetector()

    return () => {
      isCancelled = true
    }
  }, [cameraState, videoRef])

  // 2. Active inference loop while camera is active and detector is ready
  useEffect(() => {
    if (cameraState !== 'active' || !state.isModelReady) {
      return
    }

    const video = videoRef.current
    const landmarker = landmarkerRef.current
    if (!video || !landmarker) return

    let loopActive = true

    function predictFrame() {
      if (!loopActive) return

      const now = performance.now()
      // Throttle inference: ~30 FPS (at least 32ms between detections) to avoid CPU waste
      const elapsed = now - lastInferenceTimeRef.current

      if (
        elapsed >= 32 &&
        video &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        !video.paused &&
        video.videoWidth > 0 &&
        video.videoHeight > 0
      ) {
        lastInferenceTimeRef.current = now

        try {
          const results = landmarker.detectForVideo(video, now)

          if (results && results.landmarks && results.landmarks.length > 0) {
            const hand = results.landmarks[0]
            if (hand && hand.length === 21) {
              const lm = hand as NormalizedLandmark[]
              landmarksRef.current = lm

              // Extract handedness if available from detector
              let handInfo: HandednessInfo | null = null
              if (results.handedness && results.handedness.length > 0 && results.handedness[0].length > 0) {
                const cat = results.handedness[0][0]
                handInfo = {
                  label: cat.categoryName === 'Left' ? 'Left' : 'Right',
                  score: Number((cat.score ?? 1).toFixed(2)),
                }
              }
              handednessRef.current = handInfo

              // Low-frequency UI state transition: ONLY when hand was NOT detected previously
              if (!prevHandDetectedRef.current) {
                prevHandDetectedRef.current = true
                setState((prev) => ({
                  ...prev,
                  status: 'hand_detected',
                  handDetected: true,
                  landmarks: lm,
                  handedness: handInfo,
                }))
              }

              // Synchronous direct canvas draw (zero React render overhead)
              const canvas = canvasRefRef.current?.current
              if (canvas) {
                drawHandSkeleton(canvas, video, lm, isRecognisedRef.current ?? false)
              }

              // Notify frame listener for gesture recognition
              onFrameRef.current?.(lm, handInfo)
            }
          } else {
            landmarksRef.current = null
            handednessRef.current = null

            // Low-frequency UI state transition: ONLY when hand was previously detected
            if (prevHandDetectedRef.current) {
              prevHandDetectedRef.current = false
              setState((prev) => ({
                ...prev,
                status: 'no_hand',
                handDetected: false,
                landmarks: null,
                handedness: null,
              }))
            }

            const canvas = canvasRefRef.current?.current
            if (canvas) {
              drawHandSkeleton(canvas, video, null, false)
            }

            onFrameRef.current?.(null)
          }
        } catch {
          // Tracking frame error — skip frame silently and retry next frame
        }
      }

      if (loopActive) {
        animFrameIdRef.current = requestAnimationFrame(predictFrame)
      }
    }

    animFrameIdRef.current = requestAnimationFrame(predictFrame)

    return () => {
      loopActive = false
      if (animFrameIdRef.current !== null) {
        cancelAnimationFrame(animFrameIdRef.current)
        animFrameIdRef.current = null
      }
    }
  }, [cameraState, state.isModelReady, videoRef])

  // 3. Cleanup detector on full component unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false
      if (animFrameIdRef.current !== null) {
        cancelAnimationFrame(animFrameIdRef.current)
        animFrameIdRef.current = null
      }
      if (landmarkerRef.current) {
        try {
          landmarkerRef.current.close()
        } catch {
          // ignore
        }
        landmarkerRef.current = null
      }
    }
  }, [])

  return {
    ...state,
    landmarksRef,
    handednessRef,
  }
}
