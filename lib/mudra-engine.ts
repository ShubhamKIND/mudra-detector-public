import type { NormalizedLandmark, HandednessInfo } from '@/hooks/use-hand-tracking'
import { extractHandFeatures, type HandFeatures, type HandQualityStatus } from './geometric-features.ts'
import {
  evaluateMudraRulesDetailed,
  type MudraRuleDetailedResult,
  type RawRecognitionResult,
} from './mudra-rules.ts'
import {
  TemporalStabilizer,
  type StabilizedResult,
  type StabilizerDiagnostics,
  type StabilizerOptions,
} from './stabilizer.ts'
import { matchAgainstReferences, type RefMatchResult } from './mudra-reference-matcher.ts'

export type RejectionCategory =
  | 'none'
  | 'no_hand'
  | 'too_far'
  | 'edge_truncated'
  | 'ambiguous_pose'
  | 'low_score'

export type EngineDiagnostics = {
  detailedRules: MudraRuleDetailedResult
  stabilizer: StabilizerDiagnostics
  /** Experimental reference-matcher output. Surfaced in calibration dashboard only. */
  refMatch: RefMatchResult
  /** High-level categorized reason why recognition is rejected, or 'none' if recognized */
  rejectionCategory: RejectionCategory
  /** User-friendly diagnostic explanation of the rejection cause */
  rejectionExplanation: string
  /** Detected hand side if available from tracker */
  handedness: HandednessInfo | null
}

export type EngineFrameOutput = {
  features: HandFeatures | null
  raw: RawRecognitionResult
  stabilized: StabilizedResult
  diagnostics: EngineDiagnostics
}

/**
 * Geometric Mudra Recognition Engine
 * Integrates feature extraction, rule evaluation, and temporal stabilization.
 */
export class MudraEngine {
  private stabilizer: TemporalStabilizer

  constructor(options?: StabilizerOptions) {
    this.stabilizer = new TemporalStabilizer(options)
  }

  public processFrame(
    rawLandmarks: NormalizedLandmark[] | null | undefined,
    handedness: HandednessInfo | null = null,
  ): EngineFrameOutput {
    if (!rawLandmarks || rawLandmarks.length !== 21) {
      const detailedRules = evaluateMudraRulesDetailed(null)
      const stabilized = this.stabilizer.update(detailedRules.result)
      const refMatch = matchAgainstReferences(null)
      return {
        features: null,
        raw: detailedRules.result,
        stabilized,
        diagnostics: {
          detailedRules,
          stabilizer: this.stabilizer.getDiagnostics(),
          refMatch,
          rejectionCategory: 'no_hand',
          rejectionExplanation: 'No hand detected in camera view.',
          handedness: null,
        },
      }
    }

    const features = extractHandFeatures(rawLandmarks)
    const detailedRules = evaluateMudraRulesDetailed(features)
    const stabilized = this.stabilizer.update(detailedRules.result)
    const refMatch = matchAgainstReferences(rawLandmarks)

    let rejectionCategory: RejectionCategory = 'none'
    let rejectionExplanation = 'Mudra recognized.'

    if (!features) {
      rejectionCategory = 'no_hand'
      rejectionExplanation = 'No hand detected or invalid landmarks.'
    } else if (features.metrics.qualityStatus === 'edge_truncated') {
      rejectionCategory = 'edge_truncated'
      rejectionExplanation = 'Hand is near frame edge — move hand toward center.'
    } else if (features.metrics.qualityStatus === 'too_far') {
      rejectionCategory = 'too_far'
      rejectionExplanation = 'Hand is too far / small in frame — move hand closer to camera.'
    } else if (detailedRules.result.status === 'uncertain') {
      if (
        detailedRules.runnerUp &&
        detailedRules.topCandidate &&
        detailedRules.margin < detailedRules.thresholds.ambiguityMargin
      ) {
        rejectionCategory = 'ambiguous_pose'
        rejectionExplanation = `Ambiguous pose between ${detailedRules.topCandidate.name} and ${detailedRules.runnerUp.name}.`
      } else {
        rejectionCategory = 'low_score'
        rejectionExplanation = detailedRules.result.reason ?? 'Pose does not match any recognized mudra.'
      }
    }

    return {
      features,
      raw: detailedRules.result,
      stabilized,
      diagnostics: {
        detailedRules,
        stabilizer: this.stabilizer.getDiagnostics(),
        refMatch,
        rejectionCategory,
        rejectionExplanation,
        handedness,
      },
    }
  }

  public getDiagnostics(features: HandFeatures | null): EngineDiagnostics {
    return {
      detailedRules: evaluateMudraRulesDetailed(features),
      stabilizer: this.stabilizer.getDiagnostics(),
      refMatch: matchAgainstReferences(null),
      rejectionCategory: features ? 'low_score' : 'no_hand',
      rejectionExplanation: features ? 'Pose evaluation pending' : 'No hand in view',
      handedness: null,
    }
  }

  public reset(): void {
    this.stabilizer.reset()
  }
}
