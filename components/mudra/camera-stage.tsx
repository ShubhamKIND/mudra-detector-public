'use client'

import { useEffect, useRef, type RefObject } from 'react'
import type { CameraState } from '@/hooks/use-camera'
import type { NormalizedLandmark } from '@/hooks/use-hand-tracking'
import { drawHandSkeleton } from '@/lib/camera-transform'
import { cn } from '@/lib/utils'

export { drawHandSkeleton }

type CameraStageProps = {
  videoRef: RefObject<HTMLVideoElement | null>
  canvasRef?: RefObject<HTMLCanvasElement | null>
  cameraState: CameraState
  recognised: boolean
  landmarks?: NormalizedLandmark[] | null
}

export function CameraStage({ videoRef, canvasRef: externalCanvasRef, cameraState, recognised, landmarks }: CameraStageProps) {
  const isActive = cameraState === 'active'
  const internalCanvasRef = useRef<HTMLCanvasElement>(null)
  const resolvedCanvasRef = externalCanvasRef ?? internalCanvasRef

  // Fallback draw: used only if caller passes landmarks prop without externalCanvasRef driving it
  useEffect(() => {
    if (!landmarks || externalCanvasRef) return
    const canvas = resolvedCanvasRef.current
    const video = videoRef.current
    if (canvas && video && isActive) {
      drawHandSkeleton(canvas, video, landmarks, recognised)
    }
  }, [isActive, landmarks, recognised, videoRef, externalCanvasRef, resolvedCanvasRef])

  return (
    <div className="fixed inset-0 overflow-hidden bg-deep" aria-hidden={!isActive}>
      <video
        ref={videoRef}
        playsInline
        muted
        aria-label="Live camera feed"
        className={cn(
          'absolute inset-0 size-full -scale-x-100 object-cover transition-opacity duration-1000',
          isActive ? 'opacity-100' : 'opacity-0',
        )}
      />

      {/* Real hand skeleton overlay: tracks actual hand coordinates over the live video */}
      <canvas
        ref={resolvedCanvasRef}
        className={cn(
          'pointer-events-none absolute inset-0 size-full transition-opacity duration-300',
          isActive ? 'opacity-100' : 'opacity-0',
        )}
      />

      <div
        className={cn(
          'absolute inset-0 transition-opacity duration-1000',
          isActive ? 'opacity-0' : 'opacity-100',
        )}
        style={{
          background:
            'radial-gradient(ellipse 60% 55% at 72% 50%, rgb(201 162 107 / 0.10), transparent 70%), radial-gradient(ellipse 80% 70% at 20% 100%, rgb(41 36 33 / 0.9), transparent 70%), #1C1917',
        }}
      />

      <div
        className={cn(
          'absolute inset-0 transition-opacity duration-1000',
          recognised ? 'opacity-100' : 'opacity-0',
        )}
        style={{ background: 'radial-gradient(ellipse 45% 50% at 72% 50%, rgb(201 162 107 / 0.10), transparent 70%)' }}
      />

      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgb(20 18 16 / 0.75) 0%, transparent 22%, transparent 60%, rgb(20 18 16 / 0.85) 100%), radial-gradient(ellipse at center, transparent 55%, rgb(20 18 16 / 0.6) 100%)',
        }}
      />
      <div className="grain absolute inset-0" />
    </div>
  )
}
