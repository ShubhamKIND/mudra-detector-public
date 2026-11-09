import { HAND_CONNECTIONS, type HandPoint } from '@/lib/mudras'
import { cn } from '@/lib/utils'

type Tone = 'dim' | 'neutral' | 'amber'

const TONES: Record<Tone, { line: string; joint: string; tip: string }> = {
  dim: { line: 'stroke-foreground/15', joint: 'fill-foreground/20', tip: 'fill-foreground/25' },
  neutral: { line: 'stroke-foreground/45', joint: 'fill-foreground/70', tip: 'fill-foreground' },
  amber: { line: 'stroke-primary/70', joint: 'fill-primary/80', tip: 'fill-primary' },
}

const TIPS = new Set([4, 8, 12, 16, 20])

type HandSkeletonProps = {
  points: HandPoint[]
  tone?: Tone
  mirrored?: boolean
  showJoints?: boolean
  strokeWidth?: number
  className?: string
}

export function HandSkeleton({
  points,
  tone = 'neutral',
  mirrored = false,
  showJoints = true,
  strokeWidth = 0.018,
  className,
}: HandSkeletonProps) {
  const t = TONES[tone]
  return (
    <svg
      viewBox="-1.05 -2.1 2.1 2.25"
      className={cn('overflow-visible', className)}
      aria-hidden="true"
    >
      <g transform={mirrored ? 'scale(-1 1)' : undefined}>
        <g className={cn('transition-colors duration-700', t.line)} strokeWidth={strokeWidth} strokeLinecap="round">
          {HAND_CONNECTIONS.map(([a, b]) => (
            <line
              key={`${a}-${b}`}
              x1={points[a].x}
              y1={points[a].y}
              x2={points[b].x}
              y2={points[b].y}
              className="transition-all duration-700 ease-out"
            />
          ))}
        </g>
        {showJoints &&
          points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={TIPS.has(i) ? strokeWidth * 2.1 : strokeWidth * 1.5}
              className={cn('transition-all duration-700 ease-out', TIPS.has(i) ? t.tip : t.joint)}
            />
          ))}
      </g>
    </svg>
  )
}
