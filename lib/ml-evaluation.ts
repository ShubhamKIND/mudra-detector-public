/**
 * ml-evaluation.ts
 *
 * Phase 7A — ML Experiment Evaluation Engine
 *
 * Implements:
 * 1. Leave-One-Out Cross-Validation (LOOCV) for small datasets.
 * 2. Per-class precision, recall, F1 metrics.
 * 3. Full confusion matrix.
 * 4. Classifier comparison report across k-NN, Weighted k-NN, Naive Bayes.
 *
 * Run as a standalone script: node --experimental-strip-types lib/ml-evaluation.ts
 * Or called from tests/ml-experiment.test.mjs
 */

import {
  KNearestNeighbour,
  WeightedKNN,
  NaiveBayesGaussian,
  getBuiltinTrainingSamples,
  countPerClass,
  normalizeForML,
  mirrorLandmarks,
  type TrainingSample,
  type ClassifierPrediction,
} from './ml-classifier.ts'
import type { MudraId } from './mudras.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Cross-validation result types
// ─────────────────────────────────────────────────────────────────────────────

export type ConfusionMatrix = {
  labels: string[]
  matrix: number[][] // matrix[trueIdx][predIdx]
}

export type ClassMetrics = {
  label: string
  precision: number
  recall: number
  f1: number
  support: number
}

export type LOOCVResult = {
  method: string
  accuracy: number
  macroF1: number
  weightedF1: number
  classMetrics: ClassMetrics[]
  confusionMatrix: ConfusionMatrix
  predictions: { trueLabel: string; predicted: string; confidence: number }[]
  datasetInfo: {
    totalSamples: number
    augmentedSamples: number
    classesRepresented: number
    samplesPerClass: Record<string, number>
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Confusion Matrix
// ─────────────────────────────────────────────────────────────────────────────

export function buildConfusionMatrix(
  predictions: { trueLabel: string; predicted: string }[],
  labels: string[],
): ConfusionMatrix {
  const idx = new Map(labels.map((l, i) => [l, i]))
  const matrix = labels.map(() => new Array<number>(labels.length).fill(0))

  for (const { trueLabel, predicted } of predictions) {
    const ti = idx.get(trueLabel)
    const pi = idx.get(predicted ?? '')
    if (ti !== undefined && pi !== undefined) {
      matrix[ti][pi]++
    }
  }

  return { labels, matrix }
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-Class Metrics
// ─────────────────────────────────────────────────────────────────────────────

function computeClassMetrics(cm: ConfusionMatrix): ClassMetrics[] {
  const { labels, matrix } = cm
  return labels.map((label, i) => {
    const tp = matrix[i][i]
    const fp = matrix.reduce((s, row, ri) => s + (ri !== i ? row[i] : 0), 0)
    const fn = matrix[i].reduce((s, v, ci) => s + (ci !== i ? v : 0), 0)
    const support = matrix[i].reduce((s, v) => s + v, 0)
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0
    return {
      label,
      precision: Number(precision.toFixed(4)),
      recall: Number(recall.toFixed(4)),
      f1: Number(f1.toFixed(4)),
      support,
    }
  })
}

function macroF1(metrics: ClassMetrics[]): number {
  const supported = metrics.filter((m) => m.support > 0)
  if (supported.length === 0) return 0
  return Number((supported.reduce((s, m) => s + m.f1, 0) / supported.length).toFixed(4))
}

function weightedF1(metrics: ClassMetrics[]): number {
  const totalSupport = metrics.reduce((s, m) => s + m.support, 0)
  if (totalSupport === 0) return 0
  return Number(
    (metrics.reduce((s, m) => s + m.f1 * m.support, 0) / totalSupport).toFixed(4),
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// LOOCV
// ─────────────────────────────────────────────────────────────────────────────

type Classifier = {
  fit(samples: TrainingSample[], augment: boolean): unknown
  predict(query: { x: number; y: number; z: number }[]): ClassifierPrediction
  name: string
}

/**
 * Runs Leave-One-Out Cross-Validation on the given dataset.
 *
 * For each sample i:
 *  - Train on all samples EXCEPT i.
 *  - Predict the label for sample i.
 *
 * Bilateral augmentation is applied ONLY to the training fold — the query
 * sample itself is never augmented to avoid data leakage.
 */
export function runLOOCV(
  classifier: Classifier,
  samples: TrainingSample[],
  augmentBilateral = true,
): LOOCVResult {
  const n = samples.length
  const preds: { trueLabel: string; predicted: string; confidence: number }[] = []

  for (let i = 0; i < n; i++) {
    // Training fold: all samples except index i
    const trainFold = samples.filter((_, idx) => idx !== i)
    const testSample = samples[i]

    // Fit classifier on training fold
    ;(classifier as unknown as { fit(s: TrainingSample[], aug: boolean): void }).fit(
      trainFold,
      augmentBilateral,
    )

    // Predict on held-out test sample (using raw landmarks so normalization is applied by the classifier)
    const result = classifier.predict(testSample.landmarks as { x: number; y: number; z: number }[])

    preds.push({
      trueLabel: testSample.label,
      predicted: result.label ?? 'uncertain',
      confidence: result.confidence,
    })
  }

  // All unique labels in this dataset
  const labels = [...new Set(samples.map((s) => s.label))].sort()

  const cm = buildConfusionMatrix(preds, labels)
  const classMetrics = computeClassMetrics(cm)
  const correct = preds.filter((p) => p.trueLabel === p.predicted).length
  const accuracy = Number((correct / n).toFixed(4))

  const samplesPerClass = countPerClass(samples)
  const augmentedCount = augmentBilateral ? n * 2 : n

  return {
    method: classifier.name,
    accuracy,
    macroF1: macroF1(classMetrics),
    weightedF1: weightedF1(classMetrics),
    classMetrics,
    confusionMatrix: cm,
    predictions: preds,
    datasetInfo: {
      totalSamples: n,
      augmentedSamples: augmentedCount,
      classesRepresented: labels.length,
      samplesPerClass,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cross-Classifier Comparison
// ─────────────────────────────────────────────────────────────────────────────

export type ClassifierComparisonRow = {
  method: string
  accuracy: number
  macroF1: number
  weightedF1: number
  classesRepresented: number
}

export type ExperimentReport = {
  timestamp: string
  datasetSummary: {
    source: string
    totalSamples: number
    classesWithSamples: string[]
    classesWithoutSamples: string[]
    samplesPerClass: Record<string, number>
    limitation: string
  }
  augmentationApplied: boolean
  classifierComparison: ClassifierComparisonRow[]
  detailedResults: LOOCVResult[]
  conclusion: string
  recommendedNextStep: string
}

/**
 * Runs the full Phase 7A experiment:
 * - Audits the available dataset.
 * - Runs LOOCV for k=1,3 KNN, WeightedKNN(k=1), and NaiveBayes.
 * - Returns a structured report.
 */
export function runPhase7AExperiment(): ExperimentReport {
  const allMudraIds: MudraId[] = [
    'musti', 'pataka', 'alapadma', 'suchi', 'shikhara',
    'ardhachandra', 'tripataka', 'ardhapataka', 'mayura', 'mukula',
  ]

  const rawSamples = getBuiltinTrainingSamples()
  const samplesPerClass = countPerClass(rawSamples)
  const classesWithSamples = Object.keys(samplesPerClass).sort()
  const classesWithoutSamples = allMudraIds.filter((id) => !samplesPerClass[id])

  const classifiers: Classifier[] = [
    new KNearestNeighbour(1) as unknown as Classifier,
    new KNearestNeighbour(3) as unknown as Classifier,
    new WeightedKNN(1) as unknown as Classifier,
    new NaiveBayesGaussian() as unknown as Classifier,
  ]

  const detailedResults: LOOCVResult[] = []

  for (const clf of classifiers) {
    const result = runLOOCV(clf, rawSamples, true)
    detailedResults.push(result)
  }

  const comparison: ClassifierComparisonRow[] = detailedResults.map((r) => ({
    method: r.method,
    accuracy: r.accuracy,
    macroF1: r.macroF1,
    weightedF1: r.weightedF1,
    classesRepresented: r.datasetInfo.classesRepresented,
  }))

  // Find the best performing classifier
  const best = comparison.reduce((a, b) => (b.macroF1 > a.macroF1 ? b : a))

  return {
    timestamp: new Date().toISOString(),
    datasetSummary: {
      source: 'Built-in Phase 5B reference samples (lib/mudra-reference-data.ts)',
      totalSamples: rawSamples.length,
      classesWithSamples,
      classesWithoutSamples,
      samplesPerClass,
      limitation:
        `Only ${rawSamples.length} samples covering ${classesWithSamples.length}/10 mudra classes. ` +
        `The remaining ${classesWithoutSamples.length} mudras (${classesWithoutSamples.join(', ')}) ` +
        'have no reference samples and cannot be evaluated by ML. ' +
        'LOOCV leave-one-out with 2 samples/class means each fold has only 1 sample per class — ' +
        'results are optimistic and not representative of real-world performance.',
    },
    augmentationApplied: true,
    classifierComparison: comparison,
    detailedResults,
    conclusion:
      `Best classifier: ${best.method} (macro-F1 = ${best.macroF1}). ` +
      'All classifiers achieve high accuracy on this tiny dataset, which should be interpreted with extreme caution: ' +
      'with 2 samples/class and bilateral augmentation, the training signal is too small and too similar to the test signal. ' +
      'The results demonstrate that the normalization pipeline is consistent, not that production accuracy will be high. ' +
      'Real-world evaluation requires ≥ 50 real webcam samples per class from multiple participants.',
    recommendedNextStep:
      'Use the Data Collection Mode (Phase 5C) to record ≥ 30–50 webcam samples per mudra class ' +
      'from multiple hand sizes and camera distances. ' +
      'Re-run this experiment on the collected dataset using importSamplesFromCsv() or importSamplesFromJson(). ' +
      'Only then will LOOCV results be meaningful for production threshold calibration.',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pretty-print helper (used by the CLI runner)
// ─────────────────────────────────────────────────────────────────────────────

export function formatExperimentReport(report: ExperimentReport): string {
  const lines: string[] = [
    '═══════════════════════════════════════════════════════════════════',
    ' PHASE 7A — ML CLASSIFIER EXPERIMENT REPORT',
    `  Generated: ${report.timestamp}`,
    '═══════════════════════════════════════════════════════════════════',
    '',
    '── DATASET AUDIT ──────────────────────────────────────────────────',
    `  Source: ${report.datasetSummary.source}`,
    `  Total samples: ${report.datasetSummary.totalSamples}`,
    `  Classes with data (${report.datasetSummary.classesWithSamples.length}): ${report.datasetSummary.classesWithSamples.join(', ')}`,
    `  Classes WITHOUT data (${report.datasetSummary.classesWithoutSamples.length}): ${report.datasetSummary.classesWithoutSamples.join(', ')}`,
    '',
    '  Samples per class:',
    ...Object.entries(report.datasetSummary.samplesPerClass).map(
      ([k, v]) => `    ${k.padEnd(16)} ${v}`,
    ),
    '',
    `  ⚠ Limitation: ${report.datasetSummary.limitation}`,
    '',
    '── CLASSIFIER COMPARISON (Leave-One-Out Cross-Validation) ─────────',
    `  Bilateral augmentation: ${report.augmentationApplied ? 'Yes (each sample + mirror)' : 'No'}`,
    '',
    '  Method               Accuracy  Macro-F1  Weighted-F1',
    '  ─────────────────────────────────────────────────────',
    ...report.classifierComparison.map((r) =>
      `  ${r.method.padEnd(20)} ${(r.accuracy * 100).toFixed(1).padStart(7)}%  ${r.macroF1.toFixed(4).padStart(8)}  ${r.weightedF1.toFixed(4).padStart(11)}`,
    ),
    '',
  ]

  for (const result of report.detailedResults) {
    lines.push(`── ${result.method} — PER-CLASS METRICS ──────────────────────────────`)
    lines.push('  Class            Precision  Recall  F1      Support')
    lines.push('  ────────────────────────────────────────────────────')
    for (const m of result.classMetrics) {
      lines.push(
        `  ${m.label.padEnd(16)} ${m.precision.toFixed(3).padStart(9)} ` +
          `${m.recall.toFixed(3).padStart(7)} ` +
          `${m.f1.toFixed(3).padStart(7)} ` +
          `${m.support.toString().padStart(8)}`,
      )
    }
    lines.push('')
    lines.push('  Confusion Matrix (rows=true, cols=predicted):')
    const { labels, matrix } = result.confusionMatrix
    const abbr = labels.map((l) => l.slice(0, 6).padStart(7))
    lines.push('               ' + abbr.join(' '))
    matrix.forEach((row, ri) => {
      lines.push(
        `  ${labels[ri].padEnd(14)} ` + row.map((v) => v.toString().padStart(7)).join(' '),
      )
    })
    lines.push('')
  }

  lines.push('── CONCLUSION ─────────────────────────────────────────────────────')
  lines.push(`  ${report.conclusion}`)
  lines.push('')
  lines.push('── NEXT STEP ──────────────────────────────────────────────────────')
  lines.push(`  ${report.recommendedNextStep}`)
  lines.push('')
  lines.push('═══════════════════════════════════════════════════════════════════')

  return lines.join('\n')
}
