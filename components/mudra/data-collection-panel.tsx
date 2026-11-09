'use client'

import { useEffect, useRef, useState } from 'react'
import { MUDRAS, type MudraId, getMudra } from '@/lib/mudras.ts'
import type { HandFeatures } from '@/lib/geometric-features.ts'
import type { CameraState } from '@/hooks/use-camera'
import type { HandednessInfo, NormalizedLandmark } from '@/hooks/use-hand-tracking'
import {
  type CollectedSample,
  createCollectedSample,
  computeDatasetSummary,
  exportSamplesToCsv,
  exportSamplesToJson,
  importSamplesFromCsv,
  importSamplesFromJson,
} from '@/lib/mudra-data-collection.ts'
import { cn } from '@/lib/utils'

const STORAGE_KEY = 'mudra_collected_samples_v1'

export type DataCollectionPanelProps = {
  cameraState: CameraState
  handDetected: boolean
  rawLandmarks?: NormalizedLandmark[] | null
  features?: HandFeatures | null
  handedness?: HandednessInfo | null
}

export function DataCollectionPanel({
  cameraState,
  handDetected,
  rawLandmarks,
  features,
  handedness,
}: DataCollectionPanelProps) {
  const [selectedMudra, setSelectedMudra] = useState<MudraId>('pataka')
  const [samples, setSamples] = useState<CollectedSample[]>([])
  const [sessionId] = useState(() => `session_${Date.now().toString(36)}`)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 1. Load persisted samples from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) {
          setSamples(parsed)
        }
      }
    } catch {
      // Local storage unavailable or corrupt — fallback to empty
    }
  }, [])

  // 2. Persist samples whenever dataset changes
  const saveSamples = (updated: CollectedSample[]) => {
    setSamples(updated)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    } catch {
      // Ignore quota errors
    }
  }

  // 3. Compute counts
  const summary = computeDatasetSummary(samples)
  const metrics = features?.metrics

  const canCapture =
    cameraState === 'active' &&
    handDetected &&
    Boolean(rawLandmarks && rawLandmarks.length === 21) &&
    !metrics?.isTooSmall

  // Capture button handler
  const handleCapture = () => {
    if (!canCapture || !rawLandmarks) return

    const newSample = createCollectedSample({
      label: selectedMudra,
      landmarks: rawLandmarks,
      handedness: handedness?.label,
      metrics,
      sessionId,
    })

    const updated = [newSample, ...samples]
    saveSamples(updated)

    const mudraName = getMudra(selectedMudra).name
    const countForMudra = (summary.countsByMudra[selectedMudra] || 0) + 1
    setFeedback(`Captured ${mudraName} sample #${countForMudra}!`)
    setTimeout(() => setFeedback(null), 2500)
  }

  // Delete sample handler
  const handleDeleteSample = (id: string) => {
    const updated = samples.filter((s) => s.id !== id)
    saveSamples(updated)
  }

  // Clear all samples
  const handleClearAll = () => {
    if (samples.length === 0) return
    if (window.confirm(`Delete all ${samples.length} collected samples? This cannot be undone.`)) {
      saveSamples([])
      setFeedback('Dataset cleared.')
      setTimeout(() => setFeedback(null), 2000)
    }
  }

  // Download file helper
  const triggerDownload = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Export handlers
  const handleExportCsv = () => {
    if (samples.length === 0) return
    const csv = exportSamplesToCsv(samples)
    triggerDownload(csv, `mudra_dataset_${samples.length}_samples.csv`, 'text/csv;charset=utf-8;')
  }

  const handleExportJson = () => {
    if (samples.length === 0) return
    const json = exportSamplesToJson(samples)
    triggerDownload(json, `mudra_dataset_${samples.length}_samples.json`, 'application/json;charset=utf-8;')
  }

  // Import handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImportError(null)
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      if (!text) return

      let imported: CollectedSample[] = []
      let errors: string[] = []

      if (file.name.endsWith('.csv')) {
        const res = importSamplesFromCsv(text, sessionId)
        imported = res.samples
        errors = res.errors
      } else {
        const res = importSamplesFromJson(text)
        imported = res.samples
        errors = res.errors
      }

      if (errors.length > 0 && imported.length === 0) {
        setImportError(errors.slice(0, 3).join('; '))
        return
      }

      const merged = [...imported, ...samples]
      saveSamples(merged)
      setFeedback(`Imported ${imported.length} samples successfully!`)
      setTimeout(() => setFeedback(null), 3000)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div className="flex flex-col gap-4 text-xs font-mono">
      {/* ── Sub-header Banner ──────────────────────────────────────────────── */}
      <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-3.5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">
              Mudra Dataset Collector
            </h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Capture real webcam landmark coordinates under different distances, hand angles, and positions.
            </p>
          </div>
          <span className="rounded bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">
            {samples.length} Total
          </span>
        </div>
      </div>

      {/* ── 1. Target Mudra Selection ──────────────────────────────────────── */}
      <div className="rounded-xl border border-white/10 bg-black/40 p-3.5">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-2">
          1. Select Mudra to Capture:
        </span>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
          {MUDRAS.map((m) => {
            const isSelected = m.id === selectedMudra
            const count = summary.countsByMudra[m.id] || 0
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedMudra(m.id)}
                className={cn(
                  'flex items-center justify-between rounded-lg p-2 text-left border transition-all',
                  isSelected
                    ? 'border-primary bg-primary text-black font-bold shadow-md shadow-primary/20'
                    : 'border-white/10 bg-white/[0.02] text-foreground hover:border-white/20 hover:bg-white/5',
                )}
              >
                <div className="truncate">
                  <span className="text-[11px] block truncate">{m.name}</span>
                  <span className={cn('text-[9px] block truncate', isSelected ? 'text-black/70' : 'text-muted-foreground')}>
                    {m.devanagari}
                  </span>
                </div>
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.2 text-[9px] font-bold',
                    isSelected
                      ? 'bg-black/30 text-white'
                      : count > 0
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-white/10 text-muted-foreground',
                  )}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── 2. Live Quality & Capture Control ───────────────────────────────── */}
      <div className="rounded-xl border border-white/10 bg-black/40 p-3.5">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-2">
          2. Live Tracking Status & Capture:
        </span>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] mb-3">
          <div className="rounded bg-black/50 p-2 border border-white/5">
            <span className="text-muted-foreground block">Hand Detected</span>
            <span className={cn('font-semibold', handDetected ? 'text-emerald-400' : 'text-rose-400')}>
              {handDetected ? 'YES' : 'NO'}
            </span>
          </div>

          <div className="rounded bg-black/50 p-2 border border-white/5">
            <span className="text-muted-foreground block">Handedness</span>
            <span className="font-semibold text-foreground">
              {handedness ? `${handedness.label} (${Math.round(handedness.score * 100)}%)` : 'Unknown'}
            </span>
          </div>

          <div className="rounded bg-black/50 p-2 border border-white/5">
            <span className="text-muted-foreground block">Hand Size / Span</span>
            <span className="font-semibold text-foreground">
              {metrics ? `${Math.round(metrics.handSizeRatio * 100)}%` : '—'}
            </span>
          </div>

          <div className="rounded bg-black/50 p-2 border border-white/5">
            <span className="text-muted-foreground block">Quality Status</span>
            <span
              className={cn(
                'font-semibold uppercase',
                metrics?.qualityStatus === 'optimal'
                  ? 'text-emerald-400'
                  : metrics?.qualityStatus === 'acceptable'
                    ? 'text-primary'
                    : 'text-amber-400',
              )}
            >
              {metrics?.qualityStatus ?? 'waiting'}
            </span>
          </div>
        </div>

        {/* Quality guidance message */}
        {metrics?.qualityMessage && (
          <p
            className={cn(
              'rounded-lg px-3 py-1.5 mb-3 text-[10px] border',
              metrics.qualityStatus === 'optimal'
                ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300'
                : 'border-amber-500/20 bg-amber-500/5 text-amber-300',
            )}
          >
            {metrics.qualityMessage}
          </p>
        )}

        {/* Feedback alert */}
        {feedback && (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/20 px-3 py-2 mb-3 text-center text-xs font-bold text-emerald-300 animate-in fade-in">
            ✓ {feedback}
          </div>
        )}

        {/* Import error alert */}
        {importError && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/20 px-3 py-2 mb-3 text-xs text-rose-300">
            ⚠ {importError}
          </div>
        )}

        {/* Big Capture Button */}
        <button
          type="button"
          onClick={handleCapture}
          disabled={!canCapture}
          className={cn(
            'w-full rounded-xl py-3 text-sm font-bold tracking-wider uppercase transition-all shadow-lg flex items-center justify-center gap-2',
            canCapture
              ? 'bg-primary text-black hover:bg-primary/90 shadow-primary/20 active:scale-[0.99]'
              : 'bg-white/5 text-muted-foreground cursor-not-allowed border border-white/5',
          )}
        >
          <span className={cn('size-2.5 rounded-full', canCapture ? 'bg-black animate-ping' : 'bg-white/20')} />
          <span>Capture {getMudra(selectedMudra).name} Sample</span>
        </button>
      </div>

      {/* ── 3. Dataset Management & Export ─────────────────────────────────── */}
      <div className="rounded-xl border border-white/10 bg-black/40 p-3.5">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            3. Dataset Management ({samples.length} samples):
          </span>
          {samples.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              className="text-[10px] text-rose-400 hover:text-rose-300 underline"
            >
              Clear Dataset
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={samples.length === 0}
            className={cn(
              'flex-1 rounded-lg border px-3 py-2 text-[11px] font-semibold transition-all text-center',
              samples.length > 0
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                : 'border-white/5 bg-white/5 text-muted-foreground/40 cursor-not-allowed',
            )}
          >
            Export as CSV (Phase 5B Format)
          </button>

          <button
            type="button"
            onClick={handleExportJson}
            disabled={samples.length === 0}
            className={cn(
              'flex-1 rounded-lg border px-3 py-2 text-[11px] font-semibold transition-all text-center',
              samples.length > 0
                ? 'border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20'
                : 'border-white/5 bg-white/5 text-muted-foreground/40 cursor-not-allowed',
            )}
          >
            Export as JSON (Full Metadata)
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-[11px] font-semibold text-foreground hover:bg-white/20 transition-all"
          >
            Import File
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.json"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {/* Recent samples preview list */}
        {samples.length > 0 ? (
          <div className="max-h-48 overflow-y-auto space-y-1 rounded-lg border border-white/5 bg-black/50 p-2">
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground/70 block mb-1">
              Captured Samples (Newest first):
            </span>
            {samples.slice(0, 30).map((s, idx) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded bg-white/[0.02] px-2 py-1 border border-white/5 text-[10px]"
              >
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground/50 w-4">{samples.length - idx}.</span>
                  <span className="font-semibold text-primary capitalize">{s.label}</span>
                  <span className="text-muted-foreground/60 text-[9px]">
                    {s.handedness ?? 'Hand'} • Size {Math.round((s.handSizeRatio ?? 0.2) * 100)}%
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteSample(s.id)}
                  className="text-rose-400 hover:text-rose-300 text-[9px] uppercase px-1 rounded hover:bg-rose-500/10"
                  aria-label={`Delete sample for ${s.label}`}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground/60 text-center py-3 border border-dashed border-white/10 rounded-lg">
            No samples collected yet. Select a mudra above and press Capture!
          </p>
        )}
      </div>
    </div>
  )
}
