import type { RefObject } from 'react'
import type { Detection } from '@/lib/detection'
import { cn } from '@/lib/utils'

export type WristBadgeProps = {
  detection: Detection
  mudraName: string
  /**
   * When true the badge shows a "PREVIEW" indicator so it is never mistaken
   * for live AI recognition output.
   */
  isDevPreview: boolean
  /**
   * Whether the camera is currently active.
   * When true, renders a floating badge dynamically positioned over the wrist landmark.
   * When false, renders statically below the hand illustration.
   */
  cameraActive?: boolean
  /**
   * DOM Ref to the floating badge container for high-frequency direct translation.
   */
  floatingRef?: RefObject<HTMLDivElement | null>
}

/**
 * Amber glass pill indicating the currently recognized mudra.
 * - In static mode (camera off), positioned below the placeholder illustration.
 * - In live mode (camera active), floats dynamically anchored to the wrist landmark (Phase 5D).
 */
export function WristBadge({
  detection,
  mudraName,
  isDevPreview,
  cameraActive = false,
  floatingRef,
}: WristBadgeProps) {
  const visible = detection.status === 'recognised'

  if (cameraActive) {
    return (
      <div
        ref={floatingRef}
        role="status"
        aria-live="polite"
        aria-label={visible ? `Mudra recognised: ${mudraName}` : 'No mudra recognised'}
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          transform: 'translate3d(-9999px, -9999px, 0) translate(-50%, -50%)',
          opacity: 0,
          pointerEvents: 'none',
          zIndex: 35,
          willChange: 'transform, opacity',
        }}
        className="transition-opacity duration-200"
      >
        {/* The amber glass pill */}
        <div className="glass-amber flex items-center gap-2 rounded-full px-3.5 py-1.5 shadow-lg shadow-amber-950/20 backdrop-blur-md">
          {/* Amber dot pulse — only while visible, respects reduced-motion via CSS */}
          <span
            aria-hidden="true"
            className={cn(
              'size-1.5 shrink-0 rounded-full bg-primary',
              visible && 'animate-pulse',
            )}
          />
          <span className="font-brand text-sm font-medium tracking-wide text-primary">
            {mudraName}
          </span>
        </div>

        {/* Dev-only disclaimer — hidden in production so it cannot confuse visitors */}
        {isDevPreview && (
          <span
            aria-label="This is preview data, not live AI recognition"
            className="text-[9px] uppercase tracking-widest text-muted-foreground/60"
          >
            preview · not live
          </span>
        )}
      </div>
    )
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={visible ? `Mudra recognised: ${mudraName}` : 'No mudra recognised'}
      className={cn(
        // Static layout — centred below hand illustration when camera is off
        'mt-3 flex flex-col items-center gap-1 transition-all duration-500',
        visible ? 'opacity-100 translate-y-0' : 'pointer-events-none opacity-0 translate-y-1',
      )}
    >
      {/* The glass pill */}
      <div className="glass-amber flex items-center gap-2 rounded-full px-3.5 py-1.5">
        {/* Amber dot pulse — only while visible, respects reduced-motion via CSS */}
        <span
          aria-hidden="true"
          className={cn(
            'size-1.5 shrink-0 rounded-full bg-primary',
            visible && 'animate-pulse',
          )}
        />
        <span className="font-brand text-sm font-medium tracking-wide text-primary">
          {mudraName}
        </span>
      </div>

      {/* Dev-only disclaimer — hidden in production so it cannot confuse visitors */}
      {isDevPreview && (
        <span
          aria-label="This is preview data, not live AI recognition"
          className="text-[9px] uppercase tracking-widest text-muted-foreground/60"
        >
          preview · not live
        </span>
      )}
    </div>
  )
}
