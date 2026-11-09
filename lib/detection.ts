import type { HandPoint, MudraId } from './mudras'
import type { NormalizedLandmark, HandTrackingStatus } from '@/hooks/use-hand-tracking'

export type DetectionStatus = 'waiting' | 'analysing' | 'recognised'

/**
 * The contract between the camera & tracking pipeline and the UI.
 * - `status`: High-level workflow status ('waiting' | 'analysing' | 'recognised').
 * - `trackingStatus`: MediaPipe tracker state ('idle' | 'loading_model' | 'ready' | 'hand_detected' | 'no_hand' | 'error').
 * - `landmarks`: 21 normalized landmarks from MediaPipe or preview pose.
 * - `mudra`: Currently recognized or previewed mudra ID.
 * - `confidence`: Model or preview confidence score (0 to 1).
 */
export type Detection = {
  status: DetectionStatus
  trackingStatus?: HandTrackingStatus
  mudra?: MudraId
  confidence?: number
  landmarks?: HandPoint[]
  rawLandmarks?: NormalizedLandmark[]
  trackingError?: string | null
}

export const WAITING: Detection = { status: 'waiting', trackingStatus: 'idle' }
