import type { MudraId } from './mudras.ts'
import type { HandFeatures } from './geometric-features.ts'
import {
  explainMudraConditions,
  getMudraRejectionReasons,
  type MudraConditionCheck,
  type MudraRuleDetailedResult,
} from './mudra-rules.ts'
import type { StabilizerDiagnostics } from './stabilizer.ts'

/**
 * Determines whether the developer calibration dashboard should be visible.
 * Strictly false in production builds.
 */
export function shouldRenderCalibrationDashboard(isDev: boolean): boolean {
  return isDev === true
}

export type MudraDiagnosticSnapshot = {
  selectedMudra: MudraId
  conditions: MudraConditionCheck[]
  rejectionReasons: string[]
  evaluation?: {
    matched: boolean
    score: number
  }
}

/**
 * Builds a diagnostic snapshot for a specific mudra target.
 */
export function getMudraDiagnosticSnapshot(
  selectedMudra: MudraId,
  features: HandFeatures | null,
  detailedRules: MudraRuleDetailedResult,
  stabilizerDiag?: StabilizerDiagnostics,
): MudraDiagnosticSnapshot {
  const conditions = explainMudraConditions(selectedMudra, features)
  const rejectionReasons = getMudraRejectionReasons(
    selectedMudra,
    features,
    detailedRules,
    stabilizerDiag,
  )
  const evaluation = detailedRules.evaluations.find((e) => e.mudra === selectedMudra)

  return {
    selectedMudra,
    conditions,
    rejectionReasons,
    evaluation: evaluation
      ? {
          matched: evaluation.matched,
          score: evaluation.score,
        }
      : undefined,
  }
}
