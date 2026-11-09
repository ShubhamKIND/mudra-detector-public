import type { MudraId } from './mudras'
import type { RawRecognitionResult } from './mudra-rules'

export type StabilizedResult = {
  status: 'recognized' | 'uncertain' | 'no_hand'
  mudra?: MudraId
  score?: number
  reason?: string
  /** True strictly on the single frame where a new mudra is first stabilized */
  isNewRecognition: boolean
}

export type StabilizerDiagnostics = {
  windowSize: number
  consensusThreshold: number
  hysteresisHold: number
  consecutiveUncertainFrames: number
  currentMudra: MudraId | null
  currentScore: number
  history: RawRecognitionResult[]
  consensusCounts: Record<string, number>
  topCandidateCount: number
  topCandidateMudra: MudraId | null
}

export type StabilizerOptions = {
  /** Size of sliding frame buffer (default: 8) */
  windowSize?: number
  /** Minimum frames with matching mudra in buffer to establish consensus (default: 5) */
  consensusThreshold?: number
  /** Number of consecutive uncertain/missing frames allowed before dropping established mudra (default: 4) */
  hysteresisHold?: number
}

/**
 * TemporalStabilizer provides multi-frame consensus filtering for mudra detection.
 * - Prevents single-frame jitter or misclassifications.
 * - Enforces hysteresis: smooths over brief fluctuations while keeping recognized mudras stable.
 * - Resets immediately on hand departure (`no_hand`).
 * - Emits `isNewRecognition: true` strictly once when transitioning into a new mudra.
 */
export class TemporalStabilizer {
  private windowSize: number
  private consensusThreshold: number
  private hysteresisHold: number

  private history: RawRecognitionResult[] = []
  private currentMudra: MudraId | null = null
  private currentScore = 0
  private consecutiveUncertainFrames = 0

  constructor(options?: StabilizerOptions) {
    this.windowSize = options?.windowSize ?? 8
    this.consensusThreshold = options?.consensusThreshold ?? 5
    this.hysteresisHold = options?.hysteresisHold ?? 4
  }

  /**
   * Processes a new frame recognition result and returns the stabilized state.
   */
  public update(raw: RawRecognitionResult): StabilizedResult {
    // 1. Hand departed — immediate reset
    if (raw.status === 'no_hand') {
      this.reset()
      return {
        status: 'no_hand',
        reason: raw.reason,
        isNewRecognition: false,
      }
    }

    // 2. Add to rolling history buffer
    this.history.push(raw)
    if (this.history.length > this.windowSize) {
      this.history.shift()
    }

    // 3. Count frequencies of recognized mudras within the buffer
    const counts: Record<string, { count: number; totalScore: number }> = {}
    for (const item of this.history) {
      if (item.status === 'recognized') {
        const id = item.mudra
        if (!counts[id]) {
          counts[id] = { count: 0, totalScore: 0 }
        }
        counts[id].count += 1
        counts[id].totalScore += item.score
      }
    }

    // Find the candidate with highest count
    let topMudra: MudraId | null = null
    let maxCount = 0
    let avgScore = 0

    for (const [id, stats] of Object.entries(counts)) {
      if (stats.count > maxCount) {
        maxCount = stats.count
        topMudra = id as MudraId
        avgScore = Number((stats.totalScore / stats.count).toFixed(3))
      }
    }

    // 4. Check if candidate reaches consensus
    // To refresh or establish consensus, the current raw frame must be recognized
    if (raw.status === 'recognized' && topMudra && maxCount >= this.consensusThreshold) {
      const isNew = topMudra !== this.currentMudra
      this.currentMudra = topMudra
      this.currentScore = avgScore
      this.consecutiveUncertainFrames = 0

      return {
        status: 'recognized',
        mudra: topMudra,
        score: avgScore,
        isNewRecognition: isNew,
      }
    }

    // 5. Consensus not met (or current frame is uncertain) — check hysteresis
    if (this.currentMudra) {
      this.consecutiveUncertainFrames += 1

      // Hold established mudra if within tolerance window
      if (this.consecutiveUncertainFrames <= this.hysteresisHold) {
        return {
          status: 'recognized',
          mudra: this.currentMudra,
          score: this.currentScore,
          isNewRecognition: false,
        }
      }

      // Hysteresis expired: drop mudra
      this.currentMudra = null
      this.currentScore = 0
    }

    return {
      status: 'uncertain',
      reason: raw.status === 'uncertain' ? raw.reason : 'Stabilizing pose…',
      isNewRecognition: false,
    }
  }

  /**
   * Resets all internal state and buffers.
   */
  public reset(): void {
    this.history = []
    this.currentMudra = null
    this.currentScore = 0
    this.consecutiveUncertainFrames = 0
  }

  /** Current recognized mudra (if any) */
  public get recognizedMudra(): MudraId | null {
    return this.currentMudra
  }

  /**
   * Diagnostic snapshot of the stabilizer state for inspection dashboards.
   */
  public getDiagnostics(): StabilizerDiagnostics {
    const counts: Record<string, number> = {}
    for (const item of this.history) {
      if (item.status === 'recognized') {
        counts[item.mudra] = (counts[item.mudra] || 0) + 1
      }
    }
    let topCandidateCount = 0
    let topCandidateMudra: MudraId | null = null
    for (const [id, count] of Object.entries(counts)) {
      if (count > topCandidateCount) {
        topCandidateCount = count
        topCandidateMudra = id as MudraId
      }
    }

    return {
      windowSize: this.windowSize,
      consensusThreshold: this.consensusThreshold,
      hysteresisHold: this.hysteresisHold,
      consecutiveUncertainFrames: this.consecutiveUncertainFrames,
      currentMudra: this.currentMudra,
      currentScore: this.currentScore,
      history: [...this.history],
      consensusCounts: counts,
      topCandidateCount,
      topCandidateMudra,
    }
  }
}
