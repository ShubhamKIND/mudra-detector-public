import { HAND_CONNECTIONS } from './mudras.ts'

/**
 * Coordinate transform helper to map MediaPipe normalized landmark coordinates (0 to 1)
 * onto a container element where video is rendered with `object-fit: cover` and mirrored selfie mode (`-scale-x-100`).
 */

export type ScreenPoint = {
  x: number
  y: number
}

const TIPS = new Set([4, 8, 12, 16, 20])

/**
 * Synchronous canvas rendering for 21 MediaPipe hand landmarks and bone connections.
 * Runs in the single inference loop tick without touching React state.
 */
export function drawHandSkeleton(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  landmarks: { x: number; y: number }[] | null,
  recognised: boolean,
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const rect = canvas.getBoundingClientRect()
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  const targetW = Math.round(rect.width * dpr)
  const targetH = Math.round(rect.height * dpr)

  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW
    canvas.height = targetH
  }

  ctx.save()
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, rect.width, rect.height)

  if (!landmarks || landmarks.length !== 21) {
    ctx.restore()
    return
  }

  const vw = video.videoWidth || 1280
  const vh = video.videoHeight || 720
  const cw = rect.width
  const ch = rect.height
  if (cw === 0 || ch === 0) {
    ctx.restore()
    return
  }

  const points = landmarks.map((lm) =>
    transformLandmarkToScreen(lm, vw, vh, cw, ch, true),
  )

  // 1. Draw connecting bones/edges
  ctx.lineWidth = 2.2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = recognised ? 'rgba(245, 158, 11, 0.85)' : 'rgba(255, 255, 255, 0.8)'
  ctx.shadowBlur = 4
  ctx.shadowColor = recognised ? 'rgba(245, 158, 11, 0.4)' : 'rgba(20, 18, 16, 0.8)'

  for (const [a, b] of HAND_CONNECTIONS) {
    const p1 = points[a]
    const p2 = points[b]
    ctx.beginPath()
    ctx.moveTo(p1.x, p1.y)
    ctx.lineTo(p2.x, p2.y)
    ctx.stroke()
  }

  // 2. Draw joints and fingertips
  points.forEach((p, i) => {
    ctx.beginPath()
    const isTip = TIPS.has(i)
    const radius = isTip ? 4.8 : 3.2
    ctx.arc(p.x, p.y, radius, 0, 2 * Math.PI)
    ctx.fillStyle = isTip ? '#FEF08A' : '#FFFFFF'
    ctx.shadowBlur = isTip ? 8 : 4
    ctx.shadowColor = isTip ? 'rgba(254, 240, 138, 0.8)' : 'rgba(20, 18, 16, 0.8)'
    ctx.fill()
  })

  ctx.restore()
}

export function transformLandmarkToScreen(
  normalized: { x: number; y: number },
  videoWidth: number,
  videoHeight: number,
  containerWidth: number,
  containerHeight: number,
  mirrored: boolean = true,
): ScreenPoint {
  if (videoWidth <= 0 || videoHeight <= 0 || containerWidth <= 0 || containerHeight <= 0) {
    return { x: 0, y: 0 }
  }

  const videoRatio = videoWidth / videoHeight
  const containerRatio = containerWidth / containerHeight

  let scale: number
  let offsetX = 0
  let offsetY = 0

  if (containerRatio > videoRatio) {
    // Container is wider than video: video fills width, cropped top & bottom
    scale = containerWidth / videoWidth
    offsetY = (videoHeight * scale - containerHeight) / 2
  } else {
    // Container is taller than video: video fills height, cropped left & right
    scale = containerHeight / videoHeight
    offsetX = (videoWidth * scale - containerWidth) / 2
  }

  // Handle horizontal mirroring (-scale-x-100 selfie view)
  const normX = mirrored ? 1 - normalized.x : normalized.x
  const normY = normalized.y

  const screenX = normX * videoWidth * scale - offsetX
  const screenY = normY * videoHeight * scale - offsetY

  return { x: screenX, y: screenY }
}

/**
 * Computes dynamic screen coordinates for the floating mudra wrist badge.
 * Anchors to Landmark 0 (Wrist) and projects outwards in the direction opposite to Landmark 9 (Middle MCP).
 * Reuses transformLandmarkToScreen to guarantee 1:1 alignment with mirrored canvas video.
 */
export function computeWristBadgePosition(
  landmarks: { x: number; y: number }[] | null | undefined,
  videoWidth: number,
  videoHeight: number,
  containerWidth: number,
  containerHeight: number,
  mirrored: boolean = true,
  badgeWidth: number = 130,
  badgeHeight: number = 36,
): ScreenPoint | null {
  if (!landmarks || landmarks.length < 10) return null
  if (videoWidth <= 0 || videoHeight <= 0 || containerWidth <= 0 || containerHeight <= 0) return null

  const wrist = landmarks[0]
  const middleMcp = landmarks[9]
  if (!wrist || !middleMcp) return null

  // Project landmarks to screen space using the same transform as the skeleton
  const pWrist = transformLandmarkToScreen(wrist, videoWidth, videoHeight, containerWidth, containerHeight, mirrored)
  const pMiddle = transformLandmarkToScreen(middleMcp, videoWidth, videoHeight, containerWidth, containerHeight, mirrored)

  // Vector from Middle MCP (palm) to Wrist (points past the wrist away from fingers)
  const dx = pWrist.x - pMiddle.x
  const dy = pWrist.y - pMiddle.y
  const palmDist = Math.hypot(dx, dy)

  let dirX = 0
  let dirY = 1 // Default downward if distance is degenerate
  if (palmDist > 1e-4) {
    dirX = dx / palmDist
    dirY = dy / palmDist
  }

  // Offset dynamically scales with hand size on screen (closer hand -> larger distance)
  const offset = Math.max(38, Math.min(100, palmDist * 0.45))

  let targetX = pWrist.x + dirX * offset
  let targetY = pWrist.y + dirY * offset

  // Boundary safety clamp so the badge never clips outside the visible container
  const halfW = badgeWidth / 2 + 12
  const halfH = badgeHeight / 2 + 12
  targetX = Math.max(halfW, Math.min(containerWidth - halfW, targetX))
  targetY = Math.max(halfH, Math.min(containerHeight - halfH, targetY))

  return {
    x: Number(targetX.toFixed(1)),
    y: Number(targetY.toFixed(1)),
  }
}

/**
 * Exponential Moving Average (EMA) smoother for real-time badge tracking.
 * Eliminates high-frequency landmark jitter while preserving zero noticeable lag.
 */
export class BadgePositionSmoother {
  private currentX: number | null = null
  private currentY: number | null = null
  private readonly alpha: number

  constructor(alpha: number = 0.35) {
    this.alpha = alpha
  }

  update(target: ScreenPoint | null): ScreenPoint | null {
    if (!target) {
      this.reset()
      return null
    }

    if (this.currentX === null || this.currentY === null) {
      // First frame after acquisition: snap directly to prevent flying in from (0, 0)
      this.currentX = target.x
      this.currentY = target.y
      return { x: target.x, y: target.y }
    }

    // Snap on sudden large jumps (> 320px) to prevent unnatural slow glide
    const jump = Math.hypot(target.x - this.currentX, target.y - this.currentY)
    if (jump > 320) {
      this.currentX = target.x
      this.currentY = target.y
      return { x: target.x, y: target.y }
    }

    // Apply EMA filter
    this.currentX += this.alpha * (target.x - this.currentX)
    this.currentY += this.alpha * (target.y - this.currentY)

    return {
      x: Number(this.currentX.toFixed(1)),
      y: Number(this.currentY.toFixed(1)),
    }
  }

  getCurrent(): ScreenPoint | null {
    if (this.currentX === null || this.currentY === null) return null
    return { x: this.currentX, y: this.currentY }
  }

  reset(): void {
    this.currentX = null
    this.currentY = null
  }
}
