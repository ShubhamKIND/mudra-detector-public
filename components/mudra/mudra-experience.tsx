'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useCamera } from '@/hooks/use-camera'
import { useHandTracking, type NormalizedLandmark, type HandednessInfo } from '@/hooks/use-hand-tracking'
import { useMudraAudio } from '@/hooks/use-mudra-audio'
import { MUDRAS, getMudra, type MudraId } from '@/lib/mudras'
import type { Detection, DetectionStatus } from '@/lib/detection'
import { MudraEngine, type EngineFrameOutput } from '@/lib/mudra-engine'
import { evaluateMudraRulesDetailed } from '@/lib/mudra-rules'
import type { StabilizedResult } from '@/lib/stabilizer'
import { matchAgainstReferences } from '@/lib/mudra-reference-matcher'
import { computeWristBadgePosition, BadgePositionSmoother } from '@/lib/camera-transform'
import { CameraStage } from './camera-stage'
import { Header } from './header'
import { HandStage } from './hand-stage'
import { MudraCard } from './mudra-card'
import { StageControls } from './stage-controls'
import { WristBadge } from './wrist-badge'
import { CalibrationPanel } from './calibration-panel'

const previewConfidence = (id: MudraId) => 0.86 + MUDRAS.findIndex((m) => m.id === id) * 0.011

// True only during `next dev`. In production builds this evaluates to false
// at bundle time, so dev-only UI is tree-shaken out.
const IS_DEV = process.env.NODE_ENV !== 'production'

export function MudraExperience() {
  const camera = useCamera()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [soundOn, setSoundOn] = useState(false)

  // ─── Real Geometric Recognition Engine ──────────────────────────────────
  const engineRef = useRef<MudraEngine | null>(null)
  if (!engineRef.current) {
    engineRef.current = new MudraEngine({ windowSize: 8, consensusThreshold: 5, hysteresisHold: 4 })
  }

  // Ref storing latest frame engine output (high-frequency, avoids React render loops)
  const latestOutputRef = useRef<EngineFrameOutput>({
    features: null,
    raw: { status: 'no_hand', reason: 'Initial idle' },
    stabilized: { status: 'no_hand', isNewRecognition: false },
    diagnostics: {
      detailedRules: evaluateMudraRulesDetailed(null),
      stabilizer: engineRef.current.getDiagnostics(null).stabilizer,
      refMatch: matchAgainstReferences(null),
      rejectionCategory: 'no_hand',
      rejectionExplanation: 'Initial idle',
      handedness: null,
    },
  })

  // Low-frequency stabilized mudra state for UI (updates strictly on state transitions)
  const [liveRecognition, setLiveRecognition] = useState<{
    status: 'recognized' | 'uncertain' | 'no_hand'
    mudra?: MudraId
    score?: number
  }>({
    status: 'no_hand',
  })

  const lastMudraRef = useRef<MudraId | undefined>(undefined)
  const lastStatusRef = useRef<'recognized' | 'uncertain' | 'no_hand'>('no_hand')

  // ─── Simulated design-preview state ──────────────────────────────────────
  // Used for manual stepping and inspection in development mode.
  const [manualPreviewActive, setManualPreviewActive] = useState(false)
  const [previewMudra, setPreviewMudra] = useState<MudraId>('pataka')

  const manualPreviewActiveRef = useRef(false)
  manualPreviewActiveRef.current = manualPreviewActive

  // Dynamic floating wrist badge refs (Phase 5D)
  const floatingBadgeRef = useRef<HTMLDivElement>(null)
  const badgeSmootherRef = useRef<BadgePositionSmoother | null>(null)
  if (!badgeSmootherRef.current) {
    badgeSmootherRef.current = new BadgePositionSmoother(0.35)
  }

  const isCameraActive = camera.state === 'active'

  // Frame processing callback running synchronously inside predictFrame()
  const handleFrame = useCallback(
    (landmarks: NormalizedLandmark[] | null, handedness?: HandednessInfo | null) => {
      if (!landmarks) {
        badgeSmootherRef.current?.reset()
        if (floatingBadgeRef.current) {
          floatingBadgeRef.current.style.opacity = '0'
          floatingBadgeRef.current.style.pointerEvents = 'none'
        }
        const out = engineRef.current?.processFrame(null, null)
        if (out) latestOutputRef.current = out
        if (lastStatusRef.current !== 'no_hand') {
          lastStatusRef.current = 'no_hand'
          lastMudraRef.current = undefined
          setLiveRecognition({ status: 'no_hand' })
        }
        return
      }

      const out = engineRef.current?.processFrame(landmarks, handedness ?? null)
      if (!out) return
      latestOutputRef.current = out

      // Dynamic floating badge positioning (Phase 5D)
      const isRecognized = out.stabilized.status === 'recognized' || manualPreviewActiveRef.current
      if (isRecognized && camera.videoRef.current) {
        const video = camera.videoRef.current
        const vw = video.videoWidth || 1280
        const vh = video.videoHeight || 720
        const cw = window.innerWidth
        const ch = window.innerHeight
        const targetPos = computeWristBadgePosition(landmarks, vw, vh, cw, ch, true)
        const smoothed = badgeSmootherRef.current?.update(targetPos)

        if (floatingBadgeRef.current && smoothed) {
          floatingBadgeRef.current.style.transform = `translate3d(${smoothed.x}px, ${smoothed.y}px, 0) translate(-50%, -50%)`
          floatingBadgeRef.current.style.opacity = '1'
          floatingBadgeRef.current.style.pointerEvents = 'auto'
        }
      } else {
        badgeSmootherRef.current?.reset()
        if (floatingBadgeRef.current) {
          floatingBadgeRef.current.style.opacity = '0'
          floatingBadgeRef.current.style.pointerEvents = 'none'
        }
      }

      // Only update React state when stabilized recognition outcome changes
      const newStatus = out.stabilized.status
      const newMudra = out.stabilized.mudra

      if (newStatus !== lastStatusRef.current || newMudra !== lastMudraRef.current) {
        lastStatusRef.current = newStatus
        lastMudraRef.current = newMudra
        setLiveRecognition({
          status: newStatus,
          mudra: newMudra,
          score: out.stabilized.score,
        })
        if (newStatus === 'recognized') {
          setManualPreviewActive(false)
        }
      }
    },
    [camera.videoRef],
  )

  // Camera shutdown reset
  useEffect(() => {
    if (!isCameraActive) {
      badgeSmootherRef.current?.reset()
      if (floatingBadgeRef.current) {
        floatingBadgeRef.current.style.opacity = '0'
        floatingBadgeRef.current.style.pointerEvents = 'none'
      }
      engineRef.current?.reset()
      latestOutputRef.current = {
        features: null,
        raw: { status: 'no_hand', reason: 'Camera inactive' },
        stabilized: { status: 'no_hand', isNewRecognition: false },
        diagnostics: {
          detailedRules: evaluateMudraRulesDetailed(null),
          stabilizer: engineRef.current!.getDiagnostics(null).stabilizer,
          refMatch: matchAgainstReferences(null),
          rejectionCategory: 'no_hand',
          rejectionExplanation: 'Camera inactive',
          handedness: null,
        },
      }
      if (lastStatusRef.current !== 'no_hand') {
        lastStatusRef.current = 'no_hand'
        lastMudraRef.current = undefined
        setLiveRecognition({ status: 'no_hand' })
      }
    }
  }, [isCameraActive])

  // Determine effective detection state
  let effectiveStatus: DetectionStatus = 'waiting'
  let activeMudraId: MudraId = previewMudra
  let activeConfidence: number | undefined
  let isDevPreview = false

  if (isCameraActive) {
    if (liveRecognition.status === 'recognized' && liveRecognition.mudra) {
      effectiveStatus = 'recognised'
      activeMudraId = liveRecognition.mudra
      activeConfidence = liveRecognition.score
      isDevPreview = false
    } else if (manualPreviewActive) {
      effectiveStatus = 'recognised'
      activeMudraId = previewMudra
      activeConfidence = previewConfidence(previewMudra)
      isDevPreview = true
    } else if (lastStatusRef.current === 'uncertain') {
      effectiveStatus = 'analysing'
      activeMudraId = previewMudra
      isDevPreview = IS_DEV
    } else {
      effectiveStatus = 'waiting'
      activeMudraId = previewMudra
      isDevPreview = IS_DEV
    }
  } else if (manualPreviewActive) {
    effectiveStatus = 'recognised'
    activeMudraId = previewMudra
    activeConfidence = previewConfidence(previewMudra)
    isDevPreview = true
  }

  // Hand tracking hook drives single animation loop with direct canvas draw
  const tracking = useHandTracking({
    videoRef: camera.videoRef,
    canvasRef,
    cameraState: camera.state,
    isRecognised: effectiveStatus === 'recognised',
    onFrame: handleFrame,
  })

  // Refine analysing status if tracker detects hand
  if (isCameraActive && effectiveStatus === 'waiting' && tracking.handDetected) {
    effectiveStatus = 'analysing'
  }

  const detection: Detection = {
    status: effectiveStatus,
    trackingStatus: tracking.status,
    mudra: effectiveStatus === 'recognised' ? activeMudraId : undefined,
    confidence: effectiveStatus === 'recognised' ? activeConfidence : undefined,
    landmarks: tracking.landmarksRef?.current ? tracking.landmarksRef.current.map((p) => ({ x: p.x, y: p.y })) : undefined,
    rawLandmarks: tracking.landmarksRef?.current ?? undefined,
    trackingError: tracking.modelError,
  }

  const mudra = getMudra(activeMudraId)

  const stepMudra = useCallback((step: 1 | -1) => {
    setManualPreviewActive(true)
    setPreviewMudra((current) => {
      const i = MUDRAS.findIndex((m) => m.id === current)
      return MUDRAS[(i + step + MUDRAS.length) % MUDRAS.length].id
    })
  }, [])

  useMudraAudio(detection.status === 'recognised' ? mudra.id : null, soundOn)

  return (
    <main className="relative flex min-h-dvh flex-col lg:h-dvh lg:min-h-[640px] lg:overflow-hidden">
      <CameraStage
        videoRef={camera.videoRef}
        canvasRef={canvasRef}
        cameraState={camera.state}
        recognised={detection.status === 'recognised'}
      />

      <Header
        soundOn={soundOn}
        onToggleSound={() => setSoundOn((s) => !s)}
      />

      <div className="relative z-10 flex flex-1 flex-col gap-5 px-5 pb-5 sm:px-10 sm:pb-10 lg:flex-row lg:items-end lg:justify-between">
        <div className="order-2 lg:order-1">
          <MudraCard detection={detection} mudra={mudra} cameraState={camera.state} />
        </div>

        <div className="order-1 flex flex-1 items-center justify-center lg:order-2 lg:h-full lg:justify-end lg:pr-[8%]">
          <HandStage
            detection={detection}
            mudra={mudra}
            cameraState={camera.state}
            onStartCamera={camera.start}
          />
          {/* Wrist badge: indicates live recognition or dev preview */}
          <WristBadge
            detection={detection}
            mudraName={mudra.name}
            isDevPreview={isDevPreview}
            cameraActive={isCameraActive}
            floatingRef={floatingBadgeRef}
          />
        </div>

        <div className="order-1 lg:absolute lg:bottom-10 lg:right-10">
          <StageControls
            cameraState={camera.state}
            onStopCamera={camera.stop}
            onStepMudra={stepMudra}
            devMode={IS_DEV}
          />
        </div>
      </div>

      {/* Developer-only diagnostic calibration dashboard */}
      <CalibrationPanel
        isDev={IS_DEV}
        cameraState={camera.state}
        trackingStatus={tracking.status}
        handDetected={tracking.handDetected}
        latestOutputRef={latestOutputRef}
      />
    </main>
  )
}
