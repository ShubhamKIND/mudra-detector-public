'use client'

import { useEffect, useState, type RefObject } from 'react'
import { MUDRAS, type MudraId, getMudra } from '@/lib/mudras.ts'
import type { HandFeatures } from '@/lib/geometric-features.ts'
import {
  evaluateMudraRulesDetailed,
  explainMudraConditions,
  getMudraRejectionReasons,
  type MudraConditionCheck,
  type MudraRuleDetailedResult,
} from '@/lib/mudra-rules.ts'
import { shouldRenderCalibrationDashboard } from '@/lib/calibration.ts'
import type { StabilizerDiagnostics } from '@/lib/stabilizer.ts'
import type { CameraState } from '@/hooks/use-camera'
import type { HandTrackingStatus, NormalizedLandmark } from '@/hooks/use-hand-tracking'
import type { EngineFrameOutput } from '@/lib/mudra-engine.ts'
import type { RefMatchResult } from '@/lib/mudra-reference-matcher.ts'
import { DataCollectionPanel } from './data-collection-panel.tsx'
import { cn } from '@/lib/utils'

export type CalibrationPanelProps = {
  isDev: boolean
  cameraState: CameraState
  trackingStatus: HandTrackingStatus
  handDetected: boolean
  landmarksCount?: number
  latestOutputRef?: RefObject<EngineFrameOutput>
  features?: HandFeatures | null
  detailedRules?: MudraRuleDetailedResult
  stabilizerDiag?: StabilizerDiagnostics
  stabilizedMudra?: MudraId
  stabilizedScore?: number
  isNewRecognition?: boolean
}

/**
 * Developer-only Interactive Calibration Dashboard
 * Allows live inspection of geometric features, rule evaluation breakdowns,
 * condition pass/fail checks, rejection reasons, candidate rankings, and temporal stabilization.
 *
 * Throttles live UI inspection rendering (~12 FPS) only while open,
 * decoupling high-frequency tracking telemetry from React's root render loop.
 */
export function CalibrationPanel({
  isDev,
  cameraState,
  trackingStatus,
  handDetected,
  landmarksCount: propsLandmarksCount,
  latestOutputRef,
  features: propsFeatures,
  detailedRules: propsDetailedRules,
  stabilizerDiag: propsStabilizerDiag,
  stabilizedMudra: propsStabilizedMudra,
  stabilizedScore: propsStabilizedScore,
  isNewRecognition: propsIsNewRecognition,
}: CalibrationPanelProps) {
  // Hide completely in production builds
  if (!shouldRenderCalibrationDashboard(isDev)) return null

  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'diagnostics' | 'collection'>('diagnostics')
  const [selectedMudra, setSelectedMudra] = useState<MudraId>('pataka')

  // When calibration drawer is open, poll latestOutputRef at ~12 FPS (every 80ms)
  // to display live numbers smoothly without triggering re-renders in parent components
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!isOpen || !latestOutputRef) return
    const timer = setInterval(() => {
      setTick((t) => (t + 1) % 1000000)
    }, 80)
    return () => clearInterval(timer)
  }, [isOpen, latestOutputRef])

  // Resolve telemetry from ref (preferred) or direct props (fallback for tests)
  const currentOutput = latestOutputRef?.current
  const features = currentOutput ? currentOutput.features : (propsFeatures ?? null)
  const detailedRules = currentOutput
    ? currentOutput.diagnostics.detailedRules
    : (propsDetailedRules ?? evaluateMudraRulesDetailed(null))
  const stabilizerDiag: StabilizerDiagnostics = currentOutput
    ? currentOutput.diagnostics.stabilizer
    : (propsStabilizerDiag ?? {
        windowSize: 8,
        consensusThreshold: 5,
        hysteresisHold: 4,
        consecutiveUncertainFrames: 0,
        currentMudra: null,
        currentScore: 0,
        history: [],
        consensusCounts: {},
        topCandidateCount: 0,
        topCandidateMudra: null,
      })
  const stabilizedMudra = currentOutput ? currentOutput.stabilized.mudra : propsStabilizedMudra
  const isNewRecognition = currentOutput ? currentOutput.stabilized.isNewRecognition : (propsIsNewRecognition ?? false)
  const landmarksCount = features ? 21 : (propsLandmarksCount ?? 0)

  const { topCandidate, runnerUp, margin, thresholds, evaluations, result } = detailedRules

  // Experimental reference matcher output (read from same latestOutputRef)
  const refMatch: RefMatchResult | null = currentOutput?.diagnostics?.refMatch ?? null

  // Tracking quality and rejection diagnostics
  const diag = currentOutput?.diagnostics
  const rejectionCategory = diag?.rejectionCategory ?? (features ? 'low_score' : 'no_hand')
  const rejectionExplanation =
    diag?.rejectionExplanation ?? (features ? 'Pose evaluation pending' : 'No hand detected in camera view')
  const handedness = diag?.handedness ?? null
  const metrics = features?.metrics

  // Rule engine top mudra for agreement comparison
  const ruleTopMudra = result.status === 'recognized' ? (result as { mudra: string }).mudra : null

  // Checks and reasons for selected mudra
  const selectedConditions: MudraConditionCheck[] = explainMudraConditions(selectedMudra, features)
  const selectedRejectionReasons: string[] = getMudraRejectionReasons(
    selectedMudra,
    features,
    detailedRules,
    stabilizerDiag,
  )

  const selectedEvaluation = evaluations.find((e) => e.mudra === selectedMudra)
  const isSelectedRecognized = stabilizedMudra === selectedMudra

  return (
    <>
      {/* ── Floating Dev Launcher Pill ────────────────────────────────────── */}
      <div className="fixed top-20 right-4 z-40 sm:top-24 sm:right-8">
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className={cn(
            'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-mono tracking-wider transition-all shadow-lg backdrop-blur-md',
            isOpen
              ? 'border-primary bg-primary/20 text-primary shadow-primary/20'
              : 'border-white/10 bg-black/60 text-muted-foreground hover:border-primary/40 hover:text-foreground',
          )}
          aria-expanded={isOpen}
          aria-label="Toggle Mudra Calibration Dashboard"
        >
          <span
            className={cn(
              'size-2 rounded-full',
              handDetected ? 'bg-emerald-400 animate-pulse' : 'bg-muted-foreground/40',
            )}
          />
          <span>DIAGNOSTICS</span>
          <span className="rounded bg-white/10 px-1 py-0.2 text-[9px] uppercase text-muted-foreground">
            DEV
          </span>
        </button>
      </div>

      {/* ── Slide-over Calibration Drawer ─────────────────────────────────── */}
      {isOpen && (
        <aside
          role="dialog"
          aria-label="Mudra Geometric Calibration Dashboard"
          className="fixed top-0 right-0 z-50 flex h-dvh w-full max-w-xl flex-col border-l border-white/10 bg-neutral-950/95 p-5 text-foreground shadow-2xl backdrop-blur-xl sm:p-6 overflow-y-auto animate-in slide-in-from-right duration-300"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-brand text-lg font-medium tracking-wide text-primary">
                  Mudra Calibration Dashboard
                </h2>
                <span className="rounded bg-primary/10 border border-primary/20 px-1.5 py-0.5 text-[9px] font-mono text-primary uppercase">
                  Phase 5C (Dev Tools)
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Real-time geometric inspection, distance diagnostics, and dataset collection
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-lg border border-white/10 p-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
              aria-label="Close Calibration Dashboard"
            >
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex gap-2 border-b border-white/10 pb-3 mt-3">
            <button
              type="button"
              onClick={() => setActiveTab('diagnostics')}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-mono font-semibold transition-all',
                activeTab === 'diagnostics'
                  ? 'bg-primary text-black shadow-md shadow-primary/20'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/5',
              )}
            >
              Inspection & Rules
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('collection')}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-mono font-semibold transition-all flex items-center gap-2',
                activeTab === 'collection'
                  ? 'bg-primary text-black shadow-md shadow-primary/20'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/5',
              )}
            >
              <span>Data Collection</span>
              <span
                className={cn(
                  'rounded px-1.5 py-0.2 text-[9px] font-bold uppercase',
                  activeTab === 'collection'
                    ? 'bg-black/30 text-white'
                    : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
                )}
              >
                REC
              </span>
            </button>
          </div>

          {activeTab === 'collection' ? (
            <div className="mt-4">
              <DataCollectionPanel
                cameraState={cameraState}
                handDetected={handDetected}
                rawLandmarks={(currentOutput?.features?.landmarks as NormalizedLandmark[]) ?? null}
                features={features}
                handedness={handedness}
              />
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-5 text-xs">
              {/* ── Section A: Tracking & Camera State ─────────────────────────── */}
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground/80">
                    A. Tracking & Position Status
                  </h3>
                  {metrics && (
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[9px] font-mono uppercase font-bold border',
                        metrics.qualityStatus === 'optimal'
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                          : metrics.qualityStatus === 'acceptable'
                            ? 'border-primary/30 bg-primary/10 text-primary'
                            : 'border-amber-500/30 bg-amber-500/10 text-amber-300',
                      )}
                    >
                      {metrics.qualityStatus.replace('_', ' ')}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 font-mono sm:grid-cols-4 mb-2.5">
                  <div className="rounded-lg bg-black/40 p-2 border border-white/5">
                    <span className="text-[10px] text-muted-foreground block">Camera</span>
                    <span className="font-semibold text-foreground">{cameraState}</span>
                  </div>
                  <div className="rounded-lg bg-black/40 p-2 border border-white/5">
                    <span className="text-[10px] text-muted-foreground block">Hand Tracking</span>
                    <span className={cn('font-semibold', handDetected ? 'text-emerald-400' : 'text-amber-400')}>
                      {trackingStatus}
                    </span>
                  </div>
                  <div className="rounded-lg bg-black/40 p-2 border border-white/5">
                    <span className="text-[10px] text-muted-foreground block">Handedness</span>
                    <span className="font-semibold text-foreground">
                      {handedness ? `${handedness.label} (${Math.round(handedness.score * 100)}%)` : '—'}
                    </span>
                  </div>
                  <div className="rounded-lg bg-black/40 p-2 border border-white/5">
                    <span className="text-[10px] text-muted-foreground block">Palm Scale</span>
                    <span className="font-semibold text-foreground">
                      {features ? features.palmScale.toFixed(3) : '—'}
                    </span>
                  </div>
                </div>

                {/* Hand Size & Bounding Box Row */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono text-[10px] mb-2.5">
                  <div className="rounded bg-black/30 p-2 border border-white/5">
                    <span className="text-muted-foreground block">Hand Size in Frame</span>
                    <span className="font-semibold text-foreground">
                      {metrics ? `${Math.round(metrics.handSizeRatio * 100)}% span` : '—'}
                    </span>
                  </div>
                  <div className="rounded bg-black/30 p-2 border border-white/5">
                    <span className="text-muted-foreground block">Bounding Box</span>
                    <span className="font-semibold text-foreground">
                      {metrics
                        ? `${Math.round(metrics.boundingBox.width * 100)}% × ${Math.round(metrics.boundingBox.height * 100)}%`
                        : '—'}
                    </span>
                  </div>
                  <div className="rounded bg-black/30 p-2 border border-white/5">
                    <span className="text-muted-foreground block">Frame Border</span>
                    <span className={cn('font-semibold', metrics?.isNearEdge ? 'text-amber-400' : 'text-foreground')}>
                      {metrics ? (metrics.isNearEdge ? 'NEAR EDGE' : 'IN CENTER') : '—'}
                    </span>
                  </div>
                </div>

                {/* Quality Guidance Message */}
                {metrics?.qualityMessage && (
                  <div
                    className={cn(
                      'rounded-lg px-2.5 py-1.5 text-[10px] border',
                      metrics.qualityStatus === 'optimal'
                        ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300'
                        : 'border-amber-500/20 bg-amber-500/5 text-amber-300',
                    )}
                  >
                    ℹ {metrics.qualityMessage}
                  </div>
                )}
              </div>

              {/* ── Rejection Cause Diagnostic Banner ──────────────────────────── */}
              {result.status !== 'recognized' && (
                <div
                  className={cn(
                    'rounded-xl border p-3 font-mono text-[11px]',
                    rejectionCategory === 'too_far' || rejectionCategory === 'edge_truncated'
                      ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                      : rejectionCategory === 'ambiguous_pose'
                        ? 'border-primary/40 bg-primary/10 text-primary-200'
                        : 'border-white/10 bg-black/40 text-muted-foreground',
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.2 rounded bg-black/40 border border-white/10">
                      Rejection Cause: {rejectionCategory.toUpperCase()}
                    </span>
                    <span className="text-[10px]">
                      {rejectionCategory === 'too_far' || rejectionCategory === 'edge_truncated'
                        ? '• Camera Tracking Quality Issue'
                        : '• Pose Matching Issue'}
                    </span>
                  </div>
                  <p className="text-[10px] opacity-90">{rejectionExplanation}</p>
                </div>
              )}

            {/* ── Section B: Mudra Inspector & Target Selector ───────────────── */}
            <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-3.5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[11px] font-mono uppercase tracking-wider text-primary">
                  B. Mudra Inspection Target
                </h3>
                <span className="text-[10px] font-mono text-muted-foreground">Select gesture to inspect:</span>
              </div>

              {/* Pill selector for all 10 mudras */}
              <div className="flex flex-wrap gap-1.5 mb-3.5">
                {MUDRAS.map((m) => {
                  const isSelected = m.id === selectedMudra
                  const isRecognized = stabilizedMudra === m.id
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSelectedMudra(m.id)}
                      className={cn(
                        'rounded-md px-2 py-1 text-[11px] font-mono transition-all border',
                        isSelected
                          ? 'border-primary bg-primary text-black font-semibold'
                          : isRecognized
                            ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                            : 'border-white/10 bg-black/40 text-muted-foreground hover:border-white/20 hover:text-foreground',
                      )}
                    >
                      {m.name}
                    </button>
                  )
                })}
              </div>

              {/* Target vs Prediction comparison card */}
              <div className="rounded-lg border border-white/10 bg-black/50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2">
                  <div>
                    <span className="text-[10px] uppercase font-mono text-muted-foreground block">Inspecting</span>
                    <span className="font-brand text-base text-foreground font-medium">
                      {getMudra(selectedMudra).name}{' '}
                      <span className="font-deva text-xs text-primary/80">
                        ({getMudra(selectedMudra).devanagari})
                      </span>
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-mono text-muted-foreground block text-right">
                      Status for Selected
                    </span>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-mono uppercase font-semibold',
                        isSelectedRecognized
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : selectedEvaluation?.matched
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-rose-500/10 text-rose-300 border border-rose-500/20',
                      )}
                    >
                      {isSelectedRecognized
                        ? 'STABILIZED MATCH'
                        : selectedEvaluation?.matched
                          ? 'CONDITIONS MET (Awaiting Consensus)'
                          : 'REJECTED'}
                    </span>
                  </div>
                </div>

                <div className="mt-2.5 grid grid-cols-3 gap-2 font-mono text-[11px]">
                  <div>
                    <span className="text-[10px] text-muted-foreground block">Match Score</span>
                    <span className="font-semibold text-foreground">
                      {selectedEvaluation ? `${(selectedEvaluation.score * 100).toFixed(1)}%` : '0%'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block">Score Threshold</span>
                    <span className="text-muted-foreground">≥ {(thresholds.recognitionMinScore * 100).toFixed(0)}%</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block">Top Active Prediction</span>
                    <span className="font-semibold text-primary">
                      {topCandidate ? `${topCandidate.name} (${(topCandidate.score * 100).toFixed(1)}%)` : 'None'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Conditions pass/fail table */}
              <div className="mt-3 overflow-hidden rounded-lg border border-white/10 bg-black/40">
                <table className="w-full text-left font-mono text-[11px]">
                  <thead className="border-b border-white/10 bg-white/[0.03] text-[10px] uppercase text-muted-foreground">
                    <tr>
                      <th className="p-2">Condition Requirement</th>
                      <th className="p-2">Expected</th>
                      <th className="p-2">Live Value</th>
                      <th className="p-2 text-right">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {selectedConditions.map((cond) => (
                      <tr key={cond.id} className={cond.passed ? 'bg-emerald-500/[0.02]' : 'bg-rose-500/[0.03]'}>
                        <td className="p-2 font-medium text-foreground">{cond.label}</td>
                        <td className="p-2 text-muted-foreground text-[10px]">{cond.expected}</td>
                        <td className="p-2 text-foreground/90 text-[10px]">{cond.actual}</td>
                        <td className="p-2 text-right">
                          <span
                            className={cn(
                              'rounded px-1.5 py-0.5 text-[9px] font-bold uppercase',
                              cond.passed
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : 'bg-rose-500/20 text-rose-400',
                            )}
                          >
                            {cond.passed ? 'PASS' : 'FAIL'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Section C: Rejection Reasons ──────────────────────────────── */}
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.02] p-3.5">
              <h3 className="text-[11px] font-mono uppercase tracking-wider text-amber-400 mb-2">
                C. Rejection Reasons ({getMudra(selectedMudra).name})
              </h3>
              {selectedRejectionReasons.length === 0 ? (
                <div className="flex items-center gap-2 text-emerald-400 text-xs font-mono">
                  <span>✓</span>
                  <span>All geometric conditions and thresholds passed for this mudra.</span>
                </div>
              ) : (
                <ul className="space-y-1.5 font-mono text-[11px]">
                  {selectedRejectionReasons.map((reason, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-amber-200/90 bg-black/40 p-2 rounded border border-amber-500/10">
                      <span className="text-rose-400 shrink-0 font-bold">✕</span>
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* ── Section D: Live Finger Geometry Grid ──────────────────────── */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
              <h3 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground/80 mb-2.5">
                D. Finger Geometry Measurements
              </h3>

              {features ? (
                <div className="space-y-3 font-mono">
                  {/* Thumb geometry */}
                  <div className="rounded-lg bg-black/40 p-2.5 border border-white/5">
                    <span className="text-[10px] font-semibold text-primary uppercase block mb-1">
                      Thumb Kinematics
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
                      <div>
                        <span className="text-muted-foreground block">Extension:</span>
                        <span className="text-foreground font-semibold">
                          {features.fingers.thumb.extension.toFixed(2)}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">Abduction Angle:</span>
                        <span className="text-foreground font-semibold">
                          {features.thumb.abductionAngle}°
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">Elevation Angle:</span>
                        <span className="text-foreground font-semibold">
                          {features.thumb.elevationAngle}°
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">Pointing UP:</span>
                        <span className={features.thumb.isPointingUp ? 'text-emerald-400 font-bold' : 'text-muted-foreground'}>
                          {features.thumb.isPointingUp ? 'YES' : 'NO'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 4 Fingers table */}
                  <div className="overflow-hidden rounded-lg border border-white/5 bg-black/40">
                    <table className="w-full text-left text-[10px]">
                      <thead className="bg-white/[0.03] text-muted-foreground uppercase border-b border-white/5">
                        <tr>
                          <th className="p-1.5">Finger</th>
                          <th className="p-1.5">Extension</th>
                          <th className="p-1.5">State</th>
                          <th className="p-1.5">PIP / DIP Flex</th>
                          <th className="p-1.5">Tip/MCP Dist</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {(['index', 'middle', 'ring', 'pinky'] as const).map((fname) => {
                          const fin = features.fingers[fname]
                          return (
                            <tr key={fname}>
                              <td className="p-1.5 capitalize font-semibold text-foreground">{fname}</td>
                              <td className="p-1.5 text-foreground">{fin.extension.toFixed(2)}</td>
                              <td className="p-1.5">
                                <span
                                  className={cn(
                                    'rounded px-1 py-0.2 text-[9px] uppercase font-bold',
                                    fin.isExtended
                                      ? 'bg-emerald-500/20 text-emerald-400'
                                      : fin.isCurled
                                        ? 'bg-amber-500/20 text-amber-400'
                                        : 'bg-white/10 text-muted-foreground',
                                  )}
                                >
                                  {fin.isExtended ? 'Extended' : fin.isCurled ? 'Curled' : 'Partial'}
                                </span>
                              </td>
                              <td className="p-1.5 text-muted-foreground">
                                {fin.angles[1]}° / {fin.angles[2]}°
                              </td>
                              <td className="p-1.5 text-foreground">{fin.tipToMcpDist.toFixed(2)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Spread & key tip distances */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] bg-black/40 p-2.5 rounded-lg border border-white/5">
                    <div>
                      <span className="text-muted-foreground block">Adjacent Spread:</span>
                      <span className="font-semibold text-foreground">{features.fingerSpread.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Thumb-Ring Dist:</span>
                      <span className="font-semibold text-foreground">
                        {features.tipDistances.thumbRing.toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Cluster Radius:</span>
                      <span className="font-semibold text-foreground">
                        {features.tipDistances.clusterRadius.toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Max Tip Spread:</span>
                      <span className="font-semibold text-foreground">
                        {features.tipDistances.maxSpread.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="font-mono text-muted-foreground text-center py-4">
                  No hand features available. Bring hand in camera view to observe geometry.
                </p>
              )}
            </div>

            {/* ── Section E: Temporal Stabilization Diagnostics ─────────────── */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
              <h3 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground/80 mb-2.5">
                E. Temporal Stabilization
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[10px] mb-3">
                <div className="rounded bg-black/40 p-2 border border-white/5">
                  <span className="text-muted-foreground block">Stabilized Output</span>
                  <span className="font-semibold text-primary">{stabilizedMudra ?? 'None'}</span>
                </div>
                <div className="rounded bg-black/40 p-2 border border-white/5">
                  <span className="text-muted-foreground block">Consensus Count</span>
                  <span className="font-semibold text-foreground">
                    {stabilizerDiag.topCandidateCount} / {stabilizerDiag.consensusThreshold} frames
                  </span>
                </div>
                <div className="rounded bg-black/40 p-2 border border-white/5">
                  <span className="text-muted-foreground block">Hysteresis Counter</span>
                  <span className="font-semibold text-foreground">
                    {stabilizerDiag.consecutiveUncertainFrames} / {stabilizerDiag.hysteresisHold} frames
                  </span>
                </div>
                <div className="rounded bg-black/40 p-2 border border-white/5">
                  <span className="text-muted-foreground block">New Event Emitted</span>
                  <span className={cn('font-semibold', isNewRecognition ? 'text-emerald-400 font-bold' : 'text-muted-foreground')}>
                    {isNewRecognition ? 'YES (Chime)' : 'NO'}
                  </span>
                </div>
              </div>

              {/* Rolling window visualization */}
              <div>
                <span className="text-[10px] font-mono text-muted-foreground block mb-1">
                  Sliding History Window ({stabilizerDiag.history.length} / {stabilizerDiag.windowSize}):
                </span>
                <div className="flex gap-1 overflow-x-auto py-1">
                  {stabilizerDiag.history.map((item, idx) => (
                    <span
                      key={idx}
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[9px] font-mono border whitespace-nowrap',
                        item.status === 'recognized'
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                          : 'border-white/10 bg-white/5 text-muted-foreground',
                      )}
                    >
                      {item.status === 'recognized' ? item.mudra : 'uncertain'}
                    </span>
                  ))}
                  {stabilizerDiag.history.length === 0 && (
                    <span className="text-[10px] font-mono text-muted-foreground/50">History buffer empty</span>
                  )}
                </div>
              </div>
            </div>

            {/* ── Section F: All 10 Candidate Rankings ───────────────────────── */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground/80">
                  F. All 10 Mudra Candidate Rankings
                </h3>
                <span className="text-[10px] font-mono text-muted-foreground">
                  Margin: {(margin * 100).toFixed(1)}% (Req: ≥ {(thresholds.ambiguityMargin * 100).toFixed(1)}%)
                </span>
              </div>

              <div className="space-y-1.5 font-mono text-[10px]">
                {evaluations.map((ev, rank) => {
                  const isTop = rank === 0
                  const isSecond = rank === 1
                  const isSelected = ev.mudra === selectedMudra
                  const meetsThreshold = ev.score >= thresholds.recognitionMinScore

                  return (
                    <div
                      key={ev.mudra}
                      className={cn(
                        'flex items-center justify-between rounded p-1.5 border transition-all',
                        isSelected
                          ? 'border-primary/50 bg-primary/10'
                          : isTop && meetsThreshold
                            ? 'border-emerald-500/30 bg-emerald-500/5'
                            : 'border-white/5 bg-black/30',
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-muted-foreground/60 w-3">{rank + 1}.</span>
                        <span className={cn('font-medium capitalize', isSelected ? 'text-primary font-bold' : 'text-foreground')}>
                          {ev.name}
                        </span>
                        {ev.matched && (
                          <span className="rounded bg-emerald-500/20 text-emerald-400 px-1 py-0.2 text-[8px] uppercase">
                            MATCH
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Progress bar */}
                        <div className="w-20 bg-white/10 rounded-full h-1.5 overflow-hidden hidden sm:block">
                          <div
                            className={cn(
                              'h-full rounded-full',
                              meetsThreshold ? 'bg-emerald-400' : 'bg-primary/50',
                            )}
                            style={{ width: `${Math.min(100, ev.score * 100)}%` }}
                          />
                        </div>
                        <span className={cn('font-semibold w-10 text-right', meetsThreshold ? 'text-emerald-400' : 'text-muted-foreground')}>
                          {(ev.score * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* ── Section G: Reference Matcher (Experimental) ─────────────────── */}
            {refMatch && (() => {
              const agree =
                refMatch.status === 'matched' &&
                result.status === 'recognized' &&
                refMatch.topCandidate?.mudra === ruleTopMudra

              const disagree =
                refMatch.status === 'matched' &&
                result.status === 'recognized' &&
                refMatch.topCandidate?.mudra !== ruleTopMudra

              return (
                <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.03] p-3.5">
                  <div className="flex items-center gap-2 mb-2.5">
                    <h3 className="text-[11px] font-mono uppercase tracking-wider text-violet-400">
                      G. Reference Matcher
                    </h3>
                    <span className="rounded bg-violet-500/10 border border-violet-500/20 px-1.5 py-0.5 text-[9px] font-mono text-violet-400 uppercase">
                      Experimental — Phase 5B
                    </span>
                  </div>

                  {/* Summary row */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[10px] mb-3">
                    <div className="rounded bg-black/40 p-2 border border-white/5">
                      <span className="text-muted-foreground block">Ref Status</span>
                      <span
                        className={cn(
                          'font-semibold',
                          refMatch.status === 'matched'
                            ? 'text-emerald-400'
                            : refMatch.status === 'no_hand'
                              ? 'text-muted-foreground'
                              : 'text-amber-400',
                        )}
                      >
                        {refMatch.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="rounded bg-black/40 p-2 border border-white/5">
                      <span className="text-muted-foreground block">Top Match</span>
                      <span className="font-semibold text-foreground">
                        {refMatch.topCandidate ? refMatch.topCandidate.mudra : '—'}
                      </span>
                    </div>
                    <div className="rounded bg-black/40 p-2 border border-white/5">
                      <span className="text-muted-foreground block">Distance</span>
                      <span className="font-semibold text-foreground">
                        {refMatch.topCandidate ? refMatch.topCandidate.meanDist.toFixed(4) : '—'}
                      </span>
                    </div>
                    <div className="rounded bg-black/40 p-2 border border-white/5">
                      <span className="text-muted-foreground block">Orientation</span>
                      <span className="font-semibold text-primary capitalize">
                        {refMatch.matchedOrientation === 'mirrored' ? 'Left (Mirror)' : 'Right (Direct)'}
                      </span>
                    </div>
                  </div>

                  {/* Ref rejection / uncertain reason */}
                  {refMatch.reason && refMatch.status === 'uncertain' && (
                    <div className="rounded-lg bg-black/30 p-2 border border-white/5 text-[10px] text-amber-300/80 mb-3">
                      ℹ {refMatch.reason}
                    </div>
                  )}

                  {/* Agreement badge */}
                  {(agree || disagree) && (
                    <div
                      className={cn(
                        'rounded-lg border px-3 py-2 mb-3 text-[11px] font-mono',
                        agree
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                          : 'border-amber-500/30 bg-amber-500/10 text-amber-300',
                      )}
                    >
                      {agree
                        ? `✓ AGREE: Both methods predict "${refMatch.topCandidate?.mudra}"`
                        : `⚠ DISAGREE: Rules→"${ruleTopMudra ?? 'None'}" | Ref→"${refMatch.topCandidate?.mudra}"`}
                    </div>
                  )}

                  {/* Thresholds */}
                  <div className="grid grid-cols-3 gap-2 font-mono text-[10px] mb-3">
                    <div className="rounded bg-black/30 p-1.5 border border-white/5">
                      <span className="text-muted-foreground block">Dist Threshold</span>
                      <span className="text-foreground">{refMatch.thresholds.uncertainDistanceThreshold.toFixed(3)}</span>
                    </div>
                    <div className="rounded bg-black/30 p-1.5 border border-white/5">
                      <span className="text-muted-foreground block">Margin Req</span>
                      <span className="text-foreground">{refMatch.thresholds.uncertainMargin.toFixed(3)}</span>
                    </div>
                    <div className="rounded bg-black/30 p-1.5 border border-white/5">
                      <span className="text-muted-foreground block">Margin (live)</span>
                      <span
                        className={cn(
                          'font-semibold',
                          refMatch.margin !== null && refMatch.margin >= refMatch.thresholds.uncertainMargin
                            ? 'text-emerald-400'
                            : 'text-amber-400',
                        )}
                      >
                        {refMatch.margin !== null ? refMatch.margin.toFixed(4) : '—'}
                      </span>
                    </div>
                  </div>

                  {/* Ranked candidates */}
                  <div className="space-y-1 font-mono text-[10px]">
                    {refMatch.candidates.map((c, rank) => {
                      const isTop = rank === 0
                      const withinThreshold = c.meanDist <= refMatch.thresholds.uncertainDistanceThreshold
                      return (
                        <div
                          key={c.mudra}
                          className={cn(
                            'flex items-center justify-between rounded p-1.5 border',
                            isTop && withinThreshold
                              ? 'border-violet-500/40 bg-violet-500/10'
                              : 'border-white/5 bg-black/20',
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground/50 w-3">{rank + 1}.</span>
                            <span
                              className={cn(
                                'capitalize',
                                isTop && withinThreshold ? 'text-violet-300 font-semibold' : 'text-muted-foreground',
                              )}
                            >
                              {c.mudra}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-16 bg-white/10 rounded-full h-1 overflow-hidden hidden sm:block">
                              <div
                                className={cn('h-full rounded-full', withinThreshold ? 'bg-violet-400' : 'bg-white/20')}
                                style={{ width: `${Math.min(100, Math.max(0, (1 - c.meanDist / 0.5) * 100))}%` }}
                              />
                            </div>
                            <span
                              className={cn(
                                'w-16 text-right',
                                withinThreshold ? 'text-violet-300' : 'text-muted-foreground/70',
                              )}
                            >
                              {c.meanDist.toFixed(4)}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                    {refMatch.unsupportedMudras.length > 0 && (
                      <p className="text-[10px] text-muted-foreground/50 mt-1">
                        No reference samples: {refMatch.unsupportedMudras.join(', ')}
                      </p>
                    )}
                  </div>

                  <p className="mt-2 text-[9px] text-muted-foreground/40 leading-relaxed">
                    Distance = mean per-landmark L2 distance in wrist-normalized space (z×{refMatch.thresholds.zWeight}).
                    Bilateral mirroring active for left/right hands. Results are diagnostic only.
                  </p>
                </div>
              )
            })()}
            </div>
          )}
        </aside>
      )}
    </>
  )
}
