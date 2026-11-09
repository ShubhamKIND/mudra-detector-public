import { poseToLandmarks, type Mudra } from '@/lib/mudras'
import type { Detection } from '@/lib/detection'
import type { CameraState } from '@/hooks/use-camera'
import { cn } from '@/lib/utils'
import { HandSkeleton } from './hand-skeleton'

type MudraCardProps = {
  detection: Detection
  mudra: Mudra
  cameraState?: CameraState
}

/**
 * Bottom-left information card.
 *
 * Always visible across all camera and tracking states — shows a calm,
 * context-aware prompt before recognition, and full mudra information
 * once a pose is actively recognized.
 */
export function MudraCard({ detection, mudra, cameraState = 'idle' }: MudraCardProps) {
  const { status } = detection
  const isCameraActive = cameraState === 'active'
  const recognised = isCameraActive && status === 'recognised'

  // Context-aware waiting text based on camera and tracking lifecycle
  let waitingTitle = 'Waiting for your hand'
  let waitingMessage = 'Bring one hand into the camera view to begin.'

  if (cameraState === 'requesting') {
    waitingTitle = 'Starting camera…'
    waitingMessage = 'Preparing video stream for hand detection.'
  } else if (cameraState === 'denied' || cameraState === 'unavailable' || cameraState === 'no_camera') {
    waitingTitle = 'Camera inactive'
    waitingMessage = 'Camera access is required to track hands and recognise mudras.'
  } else if (cameraState === 'stopped') {
    waitingTitle = 'Camera paused'
    waitingMessage = 'Restart camera to resume hand tracking and mudra detection.'
  } else if (detection.trackingStatus === 'loading_model') {
    waitingTitle = 'Loading detector…'
    waitingMessage = 'Initializing hand landmark model.'
  } else if (detection.trackingStatus === 'error') {
    waitingTitle = 'Detector unavailable'
    waitingMessage = detection.trackingError || 'Hand tracking model could not be initialized.'
  } else if (detection.trackingStatus === 'hand_detected' || status === 'analysing') {
    waitingTitle = 'Hand detected'
    waitingMessage = 'Tracking 21 landmarks in real time.'
  }

  return (
    <section
      aria-live="polite"
      aria-label="Current mudra"
      className="glass w-full rounded-2xl p-6 transition-all duration-700 sm:w-[320px] sm:p-7"
    >
      {recognised ? (
        // ── Recognised state ──────────────────────────────────────────────
        <div key={mudra.id} className="flex items-start gap-5 animate-in fade-in slide-in-from-bottom-1 duration-500">
          {/* Mini hand illustration */}
          <div className="grid size-20 shrink-0 place-items-center rounded-xl border border-primary/20 bg-deep/50">
            <HandSkeleton points={poseToLandmarks(mudra.pose)} tone="amber" strokeWidth={0.05} className="size-16" />
          </div>

          {/* Text block */}
          <div className="min-w-0 flex-1">
            {/* Label */}
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground/70">
              Current Mudra
            </p>

            {/* English name */}
            <h2 className="font-brand text-[1.6rem] font-medium leading-none tracking-tight">
              {mudra.name}
            </h2>

            {/* Devanagari name */}
            <p lang="sa" className="font-deva mt-1 text-base leading-snug text-primary/80">
              {mudra.devanagari}
            </p>

            {/* Translation */}
            <p className="mt-0.5 text-xs font-medium uppercase tracking-wider text-muted-foreground/60">
              {mudra.translation}
            </p>

            {/* Meaning */}
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground text-pretty">
              {mudra.meaning}
            </p>

            {/* Practice guidance — separated by a subtle rule */}
            <div className="mt-3 border-t border-foreground/[0.07] pt-3">
              <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/50">
                Practice
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground/80 text-pretty">
                {mudra.guidance}
              </p>
            </div>
          </div>
        </div>
      ) : (
        // ── Waiting / camera loading / inactive state ─────────────────────
        <div className="flex items-start gap-5 animate-in fade-in duration-500">
          {/* Dim placeholder illustration */}
          <div className="grid size-20 shrink-0 place-items-center rounded-xl border border-foreground/[0.07] bg-deep/40">
            <svg
              viewBox="0 0 48 48"
              className="size-10 text-muted-foreground/25"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {/* Simplified open-hand outline */}
              <path d="M24 38 C18 38 14 34 14 28 L14 16 C14 14.3 15.3 13 17 13 C18.7 13 20 14.3 20 16 L20 24" />
              <path d="M20 20 L20 12 C20 10.3 21.3 9 23 9 C24.7 9 26 10.3 26 12 L26 20" />
              <path d="M26 20 L26 13 C26 11.3 27.3 10 29 10 C30.7 10 32 11.3 32 13 L32 20" />
              <path d="M32 20 L32 16 C32 14.3 33.3 13 35 13 C36.7 13 38 14.3 38 16 L38 26 C38 32 33 38 24 38 Z" />
            </svg>
          </div>

          {/* Prompt text */}
          <div className="min-w-0 flex-1">
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground/50">
              Current Mudra
            </p>
            <h2 className="font-brand text-lg font-medium leading-snug tracking-tight text-foreground/70">
              {waitingTitle}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground/70 text-pretty">
              {waitingMessage}
            </p>
          </div>
        </div>
      )}
    </section>
  )
}
