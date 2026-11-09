'use client'

import { Volume2, VolumeX } from 'lucide-react'
import { cn } from '@/lib/utils'

type HeaderProps = {
  soundOn: boolean
  onToggleSound: () => void
}

export function Header({ soundOn, onToggleSound }: HeaderProps) {
  return (
    <header className="pointer-events-none relative z-20 flex items-start justify-between px-5 pt-5 sm:px-10 sm:pt-8">
      <div className="pointer-events-auto select-none">
        <h1 className="font-brand text-2xl font-medium tracking-tight text-foreground sm:text-[1.75rem]">Mudra</h1>
        <p lang="sa" className="font-deva mt-0.5 text-lg leading-none text-muted-foreground sm:text-xl">
          मुद्राः
        </p>
      </div>

      <nav aria-label="Experience controls" className="pointer-events-auto flex items-center gap-2.5 sm:gap-3">
        <IconButton
          label={soundOn ? 'Mute recognition sound' : 'Enable recognition sound'}
          pressed={soundOn}
          onClick={onToggleSound}
        >
          {soundOn ? <Volume2 className="size-[18px]" /> : <VolumeX className="size-[18px]" />}
        </IconButton>
      </nav>
    </header>
  )
}

function IconButton({
  label,
  pressed,
  onClick,
  className,
  children,
}: {
  label: string
  pressed?: boolean
  onClick: () => void
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'glass grid size-11 place-items-center rounded-full text-foreground/80 transition-all duration-300 hover:text-foreground hover:border-foreground/20 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        pressed && 'text-primary hover:text-primary',
        className,
      )}
    >
      {children}
    </button>
  )
}
