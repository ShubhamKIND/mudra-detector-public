'use client'

import { ChevronLeft, ChevronRight, VideoOff } from 'lucide-react'
import type { CameraState } from '@/hooks/use-camera'

type StageControlsProps = {
  cameraState: CameraState
  onStopCamera: () => void
  onStepMudra: (step: 1 | -1) => void
  /** True only in development; hides Prev/Next in production. */
  devMode: boolean
}

const iconButton =
  'grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

export function StageControls({ cameraState, onStopCamera, onStepMudra, devMode }: StageControlsProps) {
  return (
    <div className="flex flex-col items-end gap-1.5">
      {/* Dev-only label — never shown in production */}
      {devMode && (
        <span
          aria-label="Development preview — not live recognition"
          className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-widest text-amber-400/80"
        >
          DEV PREVIEW
        </span>
      )}

      <div className="glass flex items-center gap-0.5 rounded-full p-1">
        {/* Prev / Next only visible in development */}
        {devMode && (
          <>
            <button type="button" aria-label="Previous mudra (dev preview)" onClick={() => onStepMudra(-1)} className={iconButton}>
              <ChevronLeft className="size-3.5" />
            </button>
            <button type="button" aria-label="Next mudra (dev preview)" onClick={() => onStepMudra(1)} className={iconButton}>
              <ChevronRight className="size-3.5" />
            </button>
          </>
        )}

        {cameraState === 'active' && (
          <>
            {devMode && <span className="mx-0.5 h-4 w-px bg-foreground/10" aria-hidden="true" />}
            <button type="button" onClick={onStopCamera} aria-label="Turn camera off" className={iconButton}>
              <VideoOff className="size-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
