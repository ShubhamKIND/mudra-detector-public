import type { MudraId } from './mudras.ts'
import type { NormalizedLandmark } from '@/hooks/use-hand-tracking'
import type { HandMetrics } from './geometric-features.ts'

export type CollectedLandmark = {
  x: number
  y: number
  z: number
}

export type CollectedSample = {
  id: string
  label: MudraId
  landmarks: CollectedLandmark[]
  handedness?: 'Left' | 'Right' | 'Unknown'
  handSizeRatio?: number
  palmScale?: number
  qualityStatus?: string
  timestamp: number
  sessionId: string
}

export type DatasetSummary = {
  totalCount: number
  countsByMudra: Record<MudraId, number>
}

const VALID_MUDRAS: Set<MudraId> = new Set([
  'musti',
  'pataka',
  'alapadma',
  'suchi',
  'shikhara',
  'ardhachandra',
  'tripataka',
  'ardhapataka',
  'mayura',
  'mukula',
])

/**
 * Validates a single collected sample for schema and numeric integrity.
 */
export function validateCollectedSample(sample: unknown): { valid: boolean; error?: string } {
  if (!sample || typeof sample !== 'object') {
    return { valid: false, error: 'Sample must be an object' }
  }

  const s = sample as Partial<CollectedSample>

  if (!s.label || !VALID_MUDRAS.has(s.label as MudraId)) {
    return { valid: false, error: `Invalid mudra label: "${s.label}"` }
  }

  if (!Array.isArray(s.landmarks) || s.landmarks.length !== 21) {
    return { valid: false, error: `Expected exactly 21 landmarks, got ${s.landmarks?.length}` }
  }

  for (let i = 0; i < 21; i++) {
    const p = s.landmarks[i]
    if (
      !p ||
      typeof p.x !== 'number' ||
      typeof p.y !== 'number' ||
      typeof p.z !== 'number' ||
      !Number.isFinite(p.x) ||
      !Number.isFinite(p.y) ||
      !Number.isFinite(p.z)
    ) {
      return { valid: false, error: `Landmark at index ${i} has invalid or non-finite coordinates` }
    }
  }

  return { valid: true }
}

/**
 * Creates a new CollectedSample from live tracking telemetry.
 */
export function createCollectedSample(params: {
  label: MudraId
  landmarks: NormalizedLandmark[]
  handedness?: 'Left' | 'Right' | null
  metrics?: HandMetrics | null
  sessionId: string
}): CollectedSample {
  const pts: CollectedLandmark[] = params.landmarks.map((p) => ({
    x: Number(p.x.toFixed(4)),
    y: Number(p.y.toFixed(4)),
    z: Number((p.z ?? 0).toFixed(4)),
  }))

  return {
    id: `sample_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    label: params.label,
    landmarks: pts,
    handedness: params.handedness ? params.handedness : 'Unknown',
    handSizeRatio: params.metrics ? params.metrics.handSizeRatio : undefined,
    palmScale: params.metrics ? params.metrics.palmScale : undefined,
    qualityStatus: params.metrics ? params.metrics.qualityStatus : undefined,
    timestamp: Date.now(),
    sessionId: params.sessionId,
  }
}

/**
 * Computes per-mudra sample counts and total dataset size.
 */
export function computeDatasetSummary(samples: CollectedSample[]): DatasetSummary {
  const countsByMudra: Record<MudraId, number> = {
    musti: 0,
    pataka: 0,
    alapadma: 0,
    suchi: 0,
    shikhara: 0,
    ardhachandra: 0,
    tripataka: 0,
    ardhapataka: 0,
    mayura: 0,
    mukula: 0,
  }

  for (const s of samples) {
    if (VALID_MUDRAS.has(s.label)) {
      countsByMudra[s.label] = (countsByMudra[s.label] || 0) + 1
    }
  }

  return {
    totalCount: samples.length,
    countsByMudra,
  }
}

/**
 * Exports collected samples to the exact Phase 5B CSV format:
 * label,x_0,y_0,z_0,x_1,y_1,z_1...x_20,y_20,z_20
 */
export function exportSamplesToCsv(samples: CollectedSample[]): string {
  const headerParts = ['label']
  for (let i = 0; i < 21; i++) {
    headerParts.push(`x_${i}`, `y_${i}`, `z_${i}`)
  }
  const rows: string[] = [headerParts.join(',')]

  for (const s of samples) {
    // Capitalize first letter of label to match Phase 5B CSV convention
    const capLabel = s.label.charAt(0).toUpperCase() + s.label.slice(1)
    const row = [capLabel]
    for (let i = 0; i < 21; i++) {
      const p = s.landmarks[i] || { x: 0, y: 0, z: 0 }
      row.push(p.x.toString(), p.y.toString(), p.z.toString())
    }
    rows.push(row.join(','))
  }

  return rows.join('\n')
}

/**
 * Exports collected samples to formatted JSON.
 */
export function exportSamplesToJson(samples: CollectedSample[]): string {
  return JSON.stringify(samples, null, 2)
}

/**
 * Parses and validates samples from a CSV text string.
 */
export function importSamplesFromCsv(csvText: string, sessionId: string = 'imported_session'): {
  samples: CollectedSample[]
  errors: string[]
} {
  const lines = csvText.trim().split(/\r?\n/)
  if (lines.length === 0) {
    return { samples: [], errors: ['CSV content is empty'] }
  }

  const samples: CollectedSample[] = []
  const errors: string[] = []

  // Check header line
  const firstLine = lines[0].toLowerCase()
  const startIdx = firstLine.startsWith('label') ? 1 : 0

  for (let lineIdx = startIdx; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx].trim()
    if (!line) continue

    const parts = line.split(',')
    if (parts.length < 64) {
      errors.push(`Line ${lineIdx + 1}: expected 64 columns (label + 63 coords), found ${parts.length}`)
      continue
    }

    const rawLabel = parts[0].trim().toLowerCase() as MudraId
    if (!VALID_MUDRAS.has(rawLabel)) {
      errors.push(`Line ${lineIdx + 1}: unrecognized mudra label "${parts[0]}"`)
      continue
    }

    const landmarks: CollectedLandmark[] = []
    let hasInvalidCoord = false

    for (let i = 0; i < 21; i++) {
      const x = Number(parts[1 + i * 3])
      const y = Number(parts[2 + i * 3])
      const z = Number(parts[3 + i * 3])

      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        errors.push(`Line ${lineIdx + 1}: invalid non-numeric coordinate at landmark ${i}`)
        hasInvalidCoord = true
        break
      }
      landmarks.push({ x, y, z })
    }

    if (hasInvalidCoord) continue

    samples.push({
      id: `imported_${Date.now()}_${lineIdx}_${Math.random().toString(36).slice(2, 6)}`,
      label: rawLabel,
      landmarks,
      timestamp: Date.now(),
      sessionId,
    })
  }

  return { samples, errors }
}

/**
 * Parses and validates samples from a JSON text string.
 */
export function importSamplesFromJson(jsonText: string): {
  samples: CollectedSample[]
  errors: string[]
} {
  try {
    const data = JSON.parse(jsonText)
    if (!Array.isArray(data)) {
      return { samples: [], errors: ['JSON root must be an array of samples'] }
    }

    const samples: CollectedSample[] = []
    const errors: string[] = []

    for (let i = 0; i < data.length; i++) {
      const item = data[i]
      const check = validateCollectedSample(item)
      if (!check.valid) {
        errors.push(`Item ${i}: ${check.error}`)
      } else {
        samples.push(item as CollectedSample)
      }
    }

    return { samples, errors }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Invalid JSON'
    return { samples: [], errors: [`JSON parse error: ${msg}`] }
  }
}
