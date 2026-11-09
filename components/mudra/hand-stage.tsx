import { Camera, CameraOff, Loader2, RotateCcw, VideoOff } from 'lucide-react'
import { RESTING_POSE, poseToLandmarks, type HandPoint, type Mudra } from '@/lib/mudras'
import type { Detection } from '@/lib/detection'
import type { CameraState } from '@/hooks/use-camera'
import { cn } from '@/lib/utils'
import { HandSkeleton } from './hand-skeleton'

const RESTING_POINTS = poseToLandmarks(RESTING_POSE)

type HandStageProps = {
  detection: Detection
  mudra: Mudra
  cameraState: CameraState
  onStartCamera: () => void
}

export function HandStage({ detection, mudra, cameraState, onStartCamera }: HandStageProps) {
  const { status } = detection
  const isCameraActive = cameraState === 'active'
  const recognised = isCameraActive && status === 'recognised'
  const points: HandPoint[] =
    detection.landmarks ?? (status === 'waiting' ? RESTING_POINTS : poseToLandmarks(mudra.pose))

  return (
    <div className="relative flex flex-col items-center">
      <div
        className={cn(
          'relative mt-4 aspect-[2.1/2.25] w-[min(62vw,300px)] lg:w-[min(30vw,360px)] transition-opacity duration-700',
          isCameraActive && 'opacity-0 pointer-events-none',
        )}
      >
        <div
          className={cn(
            'absolute inset-0 transition-opacity duration-700',
            status === 'waiting' && 'animate-breathe',
          )}
        >
          <HandSkeleton
            points={points}
            tone={recognised ? 'amber' : status === 'analysing' ? 'neutral' : 'dim'}
            strokeWidth={0.014}
            className="size-full"
          />
        </div>
      </div>

      {cameraState !== 'active' && (
        <CameraPrompt cameraState={cameraState} onStartCamera={onStartCamera} />
      )}
    </div>
  )
}

function CameraPrompt({ cameraState, onStartCamera }: { cameraState: CameraState; onStartCamera: () => void }) {
  const isRequesting = cameraState === 'requesting'
  const isUnsupported = cameraState === 'unsupported'

  // Text & title mapping for each camera state
  let title: string | null = null
  let message = 'Your camera stays on this device. Nothing is recorded.'
  let buttonLabel = 'Begin with your camera'
  let Icon = Camera

  switch (cameraState) {
    case 'requesting':
      message = 'Please allow camera access when prompted by your browser.'
      buttonLabel = 'Opening camera…'
      Icon = Loader2
      break

    case 'denied':
      title = 'Camera access was declined'
      message = 'Camera access is needed to recognise mudras. Please allow permissions in your browser settings.'
      buttonLabel = 'Try again'
      Icon = RotateCcw
      break

    case 'no_camera':
      title = 'No camera detected'
      message = 'We could not detect an available camera. Connect a webcam and try again.'
      buttonLabel = 'Check again'
      Icon = VideoOff
      break

    case 'unavailable':
      title = 'Camera unavailable'
      message = 'Another application may be using your camera, or the stream was interrupted.'
      buttonLabel = 'Try again'
      Icon = RotateCcw
      break

    case 'unsupported':
      title = 'Camera unsupported'
      message = 'This browser or connection (requires HTTPS) does not support camera access.'
      buttonLabel = 'Camera unavailable'
      Icon = CameraOff
      break

    case 'stopped':
      message = 'Camera is turned off. Click to resume tracking.'
      buttonLabel = 'Restart camera'
      Icon = Camera
      break

    case 'idle':
    default:
      message = 'Your camera stays on this device. Nothing is recorded.'
      buttonLabel = 'Begin with your camera'
      Icon = Camera
      break
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="mt-8 flex flex-col items-center text-center animate-in fade-in duration-700"
    >
      <button
        type="button"
        onClick={onStartCamera}
        disabled={isRequesting || isUnsupported}
        className={cn(
          'glass group inline-flex items-center gap-2.5 rounded-full px-5 py-2.5 text-sm font-medium text-foreground transition-all duration-300 hover:border-primary/40 active:scale-[0.98] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
          (cameraState === 'denied' || cameraState === 'unavailable' || cameraState === 'no_camera') &&
            'border-primary/30 hover:border-primary/60',
        )}
      >
        <Icon
          className={cn(
            'size-4 text-primary transition-transform duration-300',
            isRequesting ? 'animate-spin' : 'group-hover:scale-110',
          )}
          aria-hidden="true"
        />
        {buttonLabel}
      </button>

      {title && (
        <p className="mt-3 text-xs font-medium text-foreground/90">
          {title}
        </p>
      )}

      <p className="mt-1.5 max-w-[280px] text-xs leading-relaxed text-muted-foreground text-pretty">
        {message}
      </p>
    </div>
  )
}
