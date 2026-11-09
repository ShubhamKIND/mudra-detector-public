import type { MudraId } from './mudras'
import type { HandFeatures } from './geometric-features'

export type RecognitionStatus = 'recognized' | 'uncertain' | 'no_hand'

export type RecognizedMudra = {
  status: 'recognized'
  mudra: MudraId
  score: number
  description: string
  breakdown: Record<string, number>
}

export type UncertainRecognition = {
  status: 'uncertain'
  reason: string
  closestMudra?: MudraId
  score?: number
}

export type NoHandRecognition = {
  status: 'no_hand'
  reason: string
}

export type RawRecognitionResult = RecognizedMudra | UncertainRecognition | NoHandRecognition

export type RuleEvaluation = {
  mudra: MudraId
  name: string
  matched: boolean
  score: number
  description: string
  breakdown: Record<string, number>
}

export type MudraConditionCheck = {
  id: string
  label: string
  expected: string
  actual: string
  passed: boolean
}

export type MudraRuleDetailedResult = {
  result: RawRecognitionResult
  evaluations: RuleEvaluation[]
  topCandidate: RuleEvaluation | null
  runnerUp: RuleEvaluation | null
  margin: number
  thresholds: {
    matchMinScore: number
    recognitionMinScore: number
    ambiguityMargin: number
  }
}

function clamp(val: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, val))
}

/** Linear ramp from 0 at `from` to 1 at `to` */
function ramp(val: number, from: number, to: number): number {
  if (from === to) return val >= to ? 1 : 0
  return clamp((val - from) / (to - from))
}

/** Inverse ramp: 1 at `from`, dropping to 0 at `to` */
function invRamp(val: number, from: number, to: number): number {
  return 1 - ramp(val, from, to)
}

// ─────────────────────────────────────────────────────────────────────────────
// Individual Mudra Rules
// ─────────────────────────────────────────────────────────────────────────────

function evalMusti(f: HandFeatures): RuleEvaluation {
  const curlIndex = invRamp(f.fingers.index.extension, 0.25, 0.55)
  const curlMiddle = invRamp(f.fingers.middle.extension, 0.25, 0.55)
  const curlRing = invRamp(f.fingers.ring.extension, 0.25, 0.55)
  const curlPinky = invRamp(f.fingers.pinky.extension, 0.25, 0.55)

  // Thumb must NOT be pointing up (discriminator vs Shikhara)
  const thumbNotUp = invRamp(f.thumb.elevationAngle, 35, 65)
  // Thumb folded across or tucked
  const thumbFolded = f.thumb.isFoldedAcross ? 1.0 : invRamp(f.fingers.thumb.extension, 0.35, 0.65)

  const fingersCurled = (curlIndex + curlMiddle + curlRing + curlPinky) / 4
  const matched =
    f.fingers.index.isCurled &&
    f.fingers.middle.isCurled &&
    f.fingers.ring.isCurled &&
    f.fingers.pinky.isCurled &&
    !f.thumb.isPointingUp

  const score = Number((0.65 * fingersCurled + 0.2 * thumbNotUp + 0.15 * thumbFolded).toFixed(3))

  return {
    mudra: 'musti',
    name: 'Musti',
    matched,
    score,
    description: 'All four fingers folded into the palm, thumb curled across.',
    breakdown: { fingersCurled, thumbNotUp, thumbFolded },
  }
}

function evalShikhara(f: HandFeatures): RuleEvaluation {
  const curlIndex = invRamp(f.fingers.index.extension, 0.25, 0.55)
  const curlMiddle = invRamp(f.fingers.middle.extension, 0.25, 0.55)
  const curlRing = invRamp(f.fingers.ring.extension, 0.25, 0.55)
  const curlPinky = invRamp(f.fingers.pinky.extension, 0.25, 0.55)

  // Thumb must point straight UP along palm axis (discriminator vs Musti)
  const thumbUp = invRamp(f.thumb.elevationAngle, 20, 50)
  const thumbExt = ramp(f.fingers.thumb.extension, 0.45, 0.75)

  const fingersCurled = (curlIndex + curlMiddle + curlRing + curlPinky) / 4
  const matched =
    f.fingers.index.isCurled &&
    f.fingers.middle.isCurled &&
    f.fingers.ring.isCurled &&
    f.fingers.pinky.isCurled &&
    f.thumb.isPointingUp &&
    !f.thumb.isFoldedAcross

  const score = Number((0.55 * fingersCurled + 0.3 * thumbUp + 0.15 * thumbExt).toFixed(3))

  return {
    mudra: 'shikhara',
    name: 'Shikhara',
    matched,
    score,
    description: 'Fist with thumb extended straight upward.',
    breakdown: { fingersCurled, thumbUp, thumbExt },
  }
}

function evalSuchi(f: HandFeatures): RuleEvaluation {
  const extIndex = ramp(f.fingers.index.extension, 0.55, 0.8)
  const curlMiddle = invRamp(f.fingers.middle.extension, 0.28, 0.55)
  const curlRing = invRamp(f.fingers.ring.extension, 0.28, 0.55)
  const curlPinky = invRamp(f.fingers.pinky.extension, 0.28, 0.55)
  const otherCurled = (curlMiddle + curlRing + curlPinky) / 3

  const matched =
    f.fingers.index.isExtended &&
    f.fingers.middle.isCurled &&
    f.fingers.ring.isCurled &&
    f.fingers.pinky.isCurled

  const score = Number((0.5 * extIndex + 0.5 * otherCurled).toFixed(3))

  return {
    mudra: 'suchi',
    name: 'Suchi',
    matched,
    score,
    description: 'Index finger pointed straight upward, others curled tight.',
    breakdown: { extIndex, otherCurled },
  }
}

function evalPataka(f: HandFeatures): RuleEvaluation {
  const extIndex = ramp(f.fingers.index.extension, 0.55, 0.8)
  const extMiddle = ramp(f.fingers.middle.extension, 0.55, 0.8)
  const extRing = ramp(f.fingers.ring.extension, 0.55, 0.8)
  const extPinky = ramp(f.fingers.pinky.extension, 0.55, 0.8)
  const fingersExt = (extIndex + extMiddle + extRing + extPinky) / 4

  // Low finger spread (fingers held parallel / together)
  const lowSpread = invRamp(f.fingerSpread, 0.25, 0.38)

  // Thumb tucked close to index MCP (discriminator vs Ardhachandra)
  const thumbTucked = invRamp(f.thumb.abductionAngle, 30, 52)

  const matched =
    f.fingers.index.isExtended &&
    f.fingers.middle.isExtended &&
    f.fingers.ring.isExtended &&
    f.fingers.pinky.isExtended &&
    !f.thumb.isAbducted &&
    f.fingerSpread < 0.38

  const score = Number((0.5 * fingersExt + 0.25 * lowSpread + 0.25 * thumbTucked).toFixed(3))

  return {
    mudra: 'pataka',
    name: 'Pataka',
    matched,
    score,
    description: 'All four fingers extended straight and joined, thumb bent beside index.',
    breakdown: { fingersExt, lowSpread, thumbTucked },
  }
}

function evalArdhachandra(f: HandFeatures): RuleEvaluation {
  const extIndex = ramp(f.fingers.index.extension, 0.55, 0.8)
  const extMiddle = ramp(f.fingers.middle.extension, 0.55, 0.8)
  const extRing = ramp(f.fingers.ring.extension, 0.55, 0.8)
  const extPinky = ramp(f.fingers.pinky.extension, 0.55, 0.8)
  const fingersExt = (extIndex + extMiddle + extRing + extPinky) / 4

  // Low/moderate spread of 4 fingers
  const lowSpread = invRamp(f.fingerSpread, 0.28, 0.42)

  // Thumb abducted wide away (discriminator vs Pataka)
  const thumbAbducted = ramp(f.thumb.abductionAngle, 44, 75)

  const matched =
    f.fingers.index.isExtended &&
    f.fingers.middle.isExtended &&
    f.fingers.ring.isExtended &&
    f.fingers.pinky.isExtended &&
    f.thumb.isAbducted &&
    f.thumb.abductionAngle >= 46

  const score = Number((0.5 * fingersExt + 0.2 * lowSpread + 0.3 * thumbAbducted).toFixed(3))

  return {
    mudra: 'ardhachandra',
    name: 'Ardhachandra',
    matched,
    score,
    description: 'Four fingers straight and joined, thumb stretched wide outward.',
    breakdown: { fingersExt, lowSpread, thumbAbducted },
  }
}

function evalTripataka(f: HandFeatures): RuleEvaluation {
  const extIndex = ramp(f.fingers.index.extension, 0.55, 0.8)
  const extMiddle = ramp(f.fingers.middle.extension, 0.55, 0.8)
  const extPinky = ramp(f.fingers.pinky.extension, 0.55, 0.8)
  const curlRing = invRamp(f.fingers.ring.extension, 0.28, 0.55)

  // Thumb must NOT touch ring finger (discriminator vs Mayura)
  const notMayura = ramp(f.tipDistances.thumbRing, 0.32, 0.46)

  const threeExt = (extIndex + extMiddle + extPinky) / 3

  // Ring finger must be curled, while pinky is extended (discriminator vs Ardhapataka)
  // And ring must not touch thumb (discriminator vs Mayura)
  const matched =
    f.fingers.index.isExtended &&
    f.fingers.middle.isExtended &&
    f.fingers.pinky.isExtended &&
    (f.fingers.ring.isCurled || f.fingers.ring.extension < 0.46) &&
    f.tipDistances.thumbRing > 0.35

  const score = Number((0.5 * threeExt + 0.3 * curlRing + 0.2 * notMayura).toFixed(3))

  return {
    mudra: 'tripataka',
    name: 'Tripataka',
    matched,
    score,
    description: 'Index, middle, and pinky extended straight; ring finger bent down.',
    breakdown: { threeExt, curlRing, notMayura },
  }
}

function evalArdhapataka(f: HandFeatures): RuleEvaluation {
  const extIndex = ramp(f.fingers.index.extension, 0.55, 0.8)
  const extMiddle = ramp(f.fingers.middle.extension, 0.55, 0.8)
  const curlRing = invRamp(f.fingers.ring.extension, 0.28, 0.55)
  const curlPinky = invRamp(f.fingers.pinky.extension, 0.28, 0.55)

  const twoExt = (extIndex + extMiddle) / 2
  const twoCurled = (curlRing + curlPinky) / 2

  // Ring and pinky both curled (discriminator vs Tripataka)
  const matched =
    f.fingers.index.isExtended &&
    f.fingers.middle.isExtended &&
    (f.fingers.ring.isCurled || f.fingers.ring.extension < 0.46) &&
    (f.fingers.pinky.isCurled || f.fingers.pinky.extension < 0.46)

  const score = Number((0.5 * twoExt + 0.5 * twoCurled).toFixed(3))

  return {
    mudra: 'ardhapataka',
    name: 'Ardhapataka',
    matched,
    score,
    description: 'Index and middle fingers extended; ring and pinky fingers bent down.',
    breakdown: { twoExt, twoCurled },
  }
}

function evalAlapadma(f: HandFeatures): RuleEvaluation {
  const extIndex = ramp(f.fingers.index.extension, 0.55, 0.8)
  const extMiddle = ramp(f.fingers.middle.extension, 0.55, 0.8)
  const extRing = ramp(f.fingers.ring.extension, 0.55, 0.8)
  const extPinky = ramp(f.fingers.pinky.extension, 0.55, 0.8)
  const fingersExt = (extIndex + extMiddle + extRing + extPinky) / 4

  // High spread between adjacent fingers (petals opening) (discriminator vs Pataka)
  const highSpread = ramp(f.fingerSpread, 0.32, 0.46)
  const spreadPairs =
    (ramp(f.tipDistances.indexMiddle, 0.24, 0.36) +
      ramp(f.tipDistances.middleRing, 0.24, 0.36) +
      ramp(f.tipDistances.ringPinky, 0.24, 0.36)) /
    3

  const matched =
    f.fingers.index.isExtended &&
    f.fingers.middle.isExtended &&
    f.fingers.ring.isExtended &&
    f.fingers.pinky.isExtended &&
    f.fingerSpread >= 0.35 &&
    f.tipDistances.indexMiddle >= 0.24 &&
    f.tipDistances.middleRing >= 0.24 &&
    f.tipDistances.ringPinky >= 0.24

  const score = Number((0.4 * fingersExt + 0.3 * highSpread + 0.3 * spreadPairs).toFixed(3))

  return {
    mudra: 'alapadma',
    name: 'Alapadma',
    matched,
    score,
    description: 'All fingers extended and widely separated like blooming lotus petals.',
    breakdown: { fingersExt, highSpread, spreadPairs },
  }
}

function evalMayura(f: HandFeatures): RuleEvaluation {
  // Ring tip touches thumb tip
  const touchRingThumb = invRamp(f.tipDistances.thumbRing, 0.2, 0.4)

  // Index, Middle, and Pinky are straight and extended
  const extIndex = ramp(f.fingers.index.extension, 0.55, 0.8)
  const extMiddle = ramp(f.fingers.middle.extension, 0.55, 0.8)
  const extPinky = ramp(f.fingers.pinky.extension, 0.55, 0.8)
  const threeExt = (extIndex + extMiddle + extPinky) / 3

  // Ring finger is curled / bent to meet the thumb
  const ringBent = invRamp(f.fingers.ring.tipToMcpDist, 0.5, 0.9)

  // Other tips do NOT touch thumb (discriminator vs Mukula)
  const othersApart =
    (ramp(f.tipDistances.thumbIndex, 0.35, 0.55) + ramp(f.tipDistances.thumbPinky, 0.35, 0.55)) / 2

  const matched =
    f.tipDistances.thumbRing <= 0.4 &&
    f.fingers.index.isExtended &&
    f.fingers.middle.isExtended &&
    f.fingers.pinky.isExtended &&
    f.tipDistances.thumbIndex > 0.35

  const score = Number((0.4 * touchRingThumb + 0.3 * threeExt + 0.15 * ringBent + 0.15 * othersApart).toFixed(3))

  return {
    mudra: 'mayura',
    name: 'Mayura',
    matched,
    score,
    description: 'Ring finger touches the thumb tip; index, middle, and pinky held straight.',
    breakdown: { touchRingThumb, threeExt, ringBent, othersApart },
  }
}

function evalMukula(f: HandFeatures): RuleEvaluation {
  // All 5 fingertips drawn together in a tight cluster
  const tightCluster = invRamp(f.tipDistances.clusterRadius, 0.2, 0.38)
  const lowMaxSpread = invRamp(f.tipDistances.maxSpread, 0.35, 0.65)

  // Distance of all 4 fingers to thumb
  const dThumb =
    (invRamp(f.tipDistances.thumbIndex, 0.25, 0.48) +
      invRamp(f.tipDistances.thumbMiddle, 0.25, 0.48) +
      invRamp(f.tipDistances.thumbRing, 0.25, 0.48) +
      invRamp(f.tipDistances.thumbPinky, 0.25, 0.48)) /
    4

  const matched =
    f.tipDistances.clusterRadius <= 0.38 &&
    f.tipDistances.maxSpread <= 0.68 &&
    f.tipDistances.thumbIndex <= 0.48 &&
    f.tipDistances.thumbMiddle <= 0.48 &&
    f.tipDistances.thumbRing <= 0.48 &&
    f.tipDistances.thumbPinky <= 0.48

  const score = Number((0.4 * tightCluster + 0.3 * lowMaxSpread + 0.3 * dThumb).toFixed(3))

  return {
    mudra: 'mukula',
    name: 'Mukula',
    matched,
    score,
    description: 'All five fingertips gathered closely together into a closed bud.',
    breakdown: { tightCluster, lowMaxSpread, dThumb },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Engine Evaluator
// ─────────────────────────────────────────────────────────────────────────────

const RULE_EVALUATORS = [
  evalMusti,
  evalShikhara,
  evalSuchi,
  evalPataka,
  evalArdhachandra,
  evalTripataka,
  evalArdhapataka,
  evalAlapadma,
  evalMayura,
  evalMukula,
]

/**
 * Detailed rule evaluation providing full diagnostic candidate ranking, margins, and evaluations.
 */
export function evaluateMudraRulesDetailed(features: HandFeatures | null): MudraRuleDetailedResult {
  const thresholds = {
    matchMinScore: 0.58,
    recognitionMinScore: 0.6,
    ambiguityMargin: 0.07,
  }

  if (!features) {
    return {
      result: {
        status: 'no_hand',
        reason: 'No hand detected or invalid landmarks',
      },
      evaluations: [],
      topCandidate: null,
      runnerUp: null,
      margin: 0,
      thresholds,
    }
  }

  // 1. Evaluate all 10 rules
  const results = RULE_EVALUATORS.map((fn) => fn(features))

  // Sort descending by score
  results.sort((a, b) => b.score - a.score)

  const top = results[0] ?? null
  const second = results[1] ?? null
  const margin = top && second ? Number(Math.max(0, top.score - second.score).toFixed(3)) : (top?.score ?? 0)

  // Filter those that matched boolean criteria and have decent score
  const matched = results.filter((r) => r.matched && r.score >= thresholds.matchMinScore)

  let result: RawRecognitionResult

  if (matched.length === 0) {
    result = {
      status: 'uncertain',
      reason: 'No clear mudra pose recognized',
      closestMudra: top && top.score >= 0.45 ? top.mudra : undefined,
      score: top ? top.score : 0,
    }
  } else {
    const best = matched[0]
    const runnerUp = matched[1]

    if (runnerUp && best.score - runnerUp.score < thresholds.ambiguityMargin) {
      result = {
        status: 'uncertain',
        reason: `Ambiguous pose between ${best.name} (${Math.round(best.score * 100)}%) and ${runnerUp.name} (${Math.round(runnerUp.score * 100)}%)`,
        closestMudra: best.mudra,
        score: best.score,
      }
    } else if (best.score < thresholds.recognitionMinScore) {
      result = {
        status: 'uncertain',
        reason: `Pose partially resembles ${best.name} but score is too low (${Math.round(best.score * 100)}%)`,
        closestMudra: best.mudra,
        score: best.score,
      }
    } else {
      result = {
        status: 'recognized',
        mudra: best.mudra,
        score: best.score,
        description: best.description,
        breakdown: best.breakdown,
      }
    }
  }

  return {
    result,
    evaluations: results,
    topCandidate: top,
    runnerUp: second,
    margin,
    thresholds,
  }
}

/**
 * Evaluates geometric features against all 10 mudra rules and returns a typed recognition result.
 * - Raw non-probabilistic heuristic scores.
 * - Handles known ambiguities with margin checks.
 * - Returns 'uncertain' if pose is ambiguous or no rule matches with sufficient score.
 */
export function evaluateMudraRules(features: HandFeatures | null): RawRecognitionResult {
  return evaluateMudraRulesDetailed(features).result
}

/**
 * Returns the exact individual condition checks for a specific mudra against the live features.
 */
export function explainMudraConditions(mudraId: MudraId, f: HandFeatures | null): MudraConditionCheck[] {
  if (!f) {
    return [
      {
        id: 'hand_present',
        label: 'Hand Presence',
        expected: '21 tracked hand landmarks',
        actual: 'No hand detected',
        passed: false,
      },
    ]
  }

  const checks: MudraConditionCheck[] = []

  switch (mudraId) {
    case 'musti': {
      checks.push(
        {
          id: 'index_curled',
          label: 'Index Finger Curled',
          expected: 'Extension ≤ 0.42 or curled into palm',
          actual: `Extension = ${f.fingers.index.extension.toFixed(2)} (${f.fingers.index.isCurled ? 'curled' : 'extended'})`,
          passed: f.fingers.index.isCurled,
        },
        {
          id: 'middle_curled',
          label: 'Middle Finger Curled',
          expected: 'Extension ≤ 0.42 or curled into palm',
          actual: `Extension = ${f.fingers.middle.extension.toFixed(2)} (${f.fingers.middle.isCurled ? 'curled' : 'extended'})`,
          passed: f.fingers.middle.isCurled,
        },
        {
          id: 'ring_curled',
          label: 'Ring Finger Curled',
          expected: 'Extension ≤ 0.42 or curled into palm',
          actual: `Extension = ${f.fingers.ring.extension.toFixed(2)} (${f.fingers.ring.isCurled ? 'curled' : 'extended'})`,
          passed: f.fingers.ring.isCurled,
        },
        {
          id: 'pinky_curled',
          label: 'Pinky Finger Curled',
          expected: 'Extension ≤ 0.42 or curled into palm',
          actual: `Extension = ${f.fingers.pinky.extension.toFixed(2)} (${f.fingers.pinky.isCurled ? 'curled' : 'extended'})`,
          passed: f.fingers.pinky.isCurled,
        },
        {
          id: 'thumb_not_up',
          label: 'Thumb Folded Across (Not Up)',
          expected: 'Elevation angle ≥ 45° or not pointing up',
          actual: `Elevation = ${f.thumb.elevationAngle}° (${f.thumb.isPointingUp ? 'pointing UP' : 'not up'})`,
          passed: !f.thumb.isPointingUp,
        },
      )
      break
    }

    case 'shikhara': {
      checks.push(
        {
          id: 'four_curled',
          label: 'All 4 Fingers Curled into Fist',
          expected: 'Index, middle, ring, pinky all curled',
          actual: `Curled: [${f.fingers.index.isCurled ? 'I' : '-'}, ${f.fingers.middle.isCurled ? 'M' : '-'}, ${f.fingers.ring.isCurled ? 'R' : '-'}, ${f.fingers.pinky.isCurled ? 'P' : '-'}]`,
          passed:
            f.fingers.index.isCurled &&
            f.fingers.middle.isCurled &&
            f.fingers.ring.isCurled &&
            f.fingers.pinky.isCurled,
        },
        {
          id: 'thumb_up',
          label: 'Thumb Pointing Straight UP',
          expected: 'Elevation < 45° and extension > 0.55',
          actual: `Elevation = ${f.thumb.elevationAngle}°, Ext = ${f.fingers.thumb.extension.toFixed(2)} (${f.thumb.isPointingUp ? 'pointing UP' : 'not pointing up'})`,
          passed: f.thumb.isPointingUp,
        },
        {
          id: 'thumb_not_folded',
          label: 'Thumb Not Folded Across Palm',
          expected: 'Thumb extended away from palm surface',
          actual: f.thumb.isFoldedAcross ? 'Folded across fingers' : 'Extended upright',
          passed: !f.thumb.isFoldedAcross,
        },
      )
      break
    }

    case 'suchi': {
      checks.push(
        {
          id: 'index_extended',
          label: 'Index Finger Pointed Upward',
          expected: 'Extension ≥ 0.62 and tip farther than PIP',
          actual: `Extension = ${f.fingers.index.extension.toFixed(2)} (${f.fingers.index.isExtended ? 'extended' : 'not extended'})`,
          passed: f.fingers.index.isExtended,
        },
        {
          id: 'middle_curled',
          label: 'Middle Finger Curled',
          expected: 'Extension ≤ 0.42 or curled',
          actual: `Extension = ${f.fingers.middle.extension.toFixed(2)} (${f.fingers.middle.isCurled ? 'curled' : 'extended'})`,
          passed: f.fingers.middle.isCurled,
        },
        {
          id: 'ring_curled',
          label: 'Ring Finger Curled',
          expected: 'Extension ≤ 0.42 or curled',
          actual: `Extension = ${f.fingers.ring.extension.toFixed(2)} (${f.fingers.ring.isCurled ? 'curled' : 'extended'})`,
          passed: f.fingers.ring.isCurled,
        },
        {
          id: 'pinky_curled',
          label: 'Pinky Finger Curled',
          expected: 'Extension ≤ 0.42 or curled',
          actual: `Extension = ${f.fingers.pinky.extension.toFixed(2)} (${f.fingers.pinky.isCurled ? 'curled' : 'extended'})`,
          passed: f.fingers.pinky.isCurled,
        },
      )
      break
    }

    case 'pataka': {
      const allExt =
        f.fingers.index.isExtended &&
        f.fingers.middle.isExtended &&
        f.fingers.ring.isExtended &&
        f.fingers.pinky.isExtended
      checks.push(
        {
          id: 'four_extended',
          label: 'All 4 Fingers Straight and Extended',
          expected: 'Index, middle, ring, pinky all extended',
          actual: `Extended: [${f.fingers.index.isExtended ? 'I' : '-'}, ${f.fingers.middle.isExtended ? 'M' : '-'}, ${f.fingers.ring.isExtended ? 'R' : '-'}, ${f.fingers.pinky.isExtended ? 'P' : '-'}]`,
          passed: allExt,
        },
        {
          id: 'low_spread',
          label: 'Fingers Joined (Low Spread)',
          expected: 'Average spread < 0.38',
          actual: `Spread = ${f.fingerSpread.toFixed(2)}`,
          passed: f.fingerSpread < 0.38,
        },
        {
          id: 'thumb_tucked',
          label: 'Thumb Beside Index (Not Abducted Wide)',
          expected: 'Abduction angle < 46° or dist < 0.72',
          actual: `Abduction = ${f.thumb.abductionAngle}° (${f.thumb.isAbducted ? 'abducted wide' : 'beside index'})`,
          passed: !f.thumb.isAbducted,
        },
      )
      break
    }

    case 'ardhachandra': {
      const allExt =
        f.fingers.index.isExtended &&
        f.fingers.middle.isExtended &&
        f.fingers.ring.isExtended &&
        f.fingers.pinky.isExtended
      checks.push(
        {
          id: 'four_extended',
          label: 'All 4 Fingers Straight and Extended',
          expected: 'Index, middle, ring, pinky all extended',
          actual: `Extended: [${f.fingers.index.isExtended ? 'I' : '-'}, ${f.fingers.middle.isExtended ? 'M' : '-'}, ${f.fingers.ring.isExtended ? 'R' : '-'}, ${f.fingers.pinky.isExtended ? 'P' : '-'}]`,
          passed: allExt,
        },
        {
          id: 'thumb_abducted',
          label: 'Thumb Stretched Wide Outward',
          expected: 'Abduction angle ≥ 46° and abducted',
          actual: `Abduction = ${f.thumb.abductionAngle}° (${f.thumb.isAbducted ? 'abducted wide' : 'beside index'})`,
          passed: f.thumb.isAbducted && f.thumb.abductionAngle >= 46,
        },
      )
      break
    }

    case 'tripataka': {
      checks.push(
        {
          id: 'three_extended',
          label: 'Index, Middle, and Pinky Extended',
          expected: 'Index, middle, pinky straight',
          actual: `Extended: [${f.fingers.index.isExtended ? 'I' : '-'}, ${f.fingers.middle.isExtended ? 'M' : '-'}, ${f.fingers.pinky.isExtended ? 'P' : '-'}]`,
          passed: f.fingers.index.isExtended && f.fingers.middle.isExtended && f.fingers.pinky.isExtended,
        },
        {
          id: 'ring_curled',
          label: 'Ring Finger Curled Down',
          expected: 'Ring finger curled or extension < 0.46',
          actual: `Ring extension = ${f.fingers.ring.extension.toFixed(2)} (${f.fingers.ring.isCurled ? 'curled' : 'extended'})`,
          passed: f.fingers.ring.isCurled || f.fingers.ring.extension < 0.46,
        },
        {
          id: 'not_touching_thumb',
          label: 'Ring Does NOT Touch Thumb (vs Mayura)',
          expected: 'Distance thumb-to-ring > 0.35',
          actual: `Distance = ${f.tipDistances.thumbRing.toFixed(2)}`,
          passed: f.tipDistances.thumbRing > 0.35,
        },
      )
      break
    }

    case 'ardhapataka': {
      checks.push(
        {
          id: 'two_extended',
          label: 'Index and Middle Extended',
          expected: 'Index and middle straight',
          actual: `Extended: [${f.fingers.index.isExtended ? 'I' : '-'}, ${f.fingers.middle.isExtended ? 'M' : '-'}]`,
          passed: f.fingers.index.isExtended && f.fingers.middle.isExtended,
        },
        {
          id: 'ring_curled',
          label: 'Ring Finger Curled Down',
          expected: 'Ring curled or extension < 0.46',
          actual: `Ring extension = ${f.fingers.ring.extension.toFixed(2)}`,
          passed: f.fingers.ring.isCurled || f.fingers.ring.extension < 0.46,
        },
        {
          id: 'pinky_curled',
          label: 'Pinky Finger Curled Down',
          expected: 'Pinky curled or extension < 0.46',
          actual: `Pinky extension = ${f.fingers.pinky.extension.toFixed(2)}`,
          passed: f.fingers.pinky.isCurled || f.fingers.pinky.extension < 0.46,
        },
      )
      break
    }

    case 'alapadma': {
      const allExt =
        f.fingers.index.isExtended &&
        f.fingers.middle.isExtended &&
        f.fingers.ring.isExtended &&
        f.fingers.pinky.isExtended
      const pairwise =
        f.tipDistances.indexMiddle >= 0.24 &&
        f.tipDistances.middleRing >= 0.24 &&
        f.tipDistances.ringPinky >= 0.24
      checks.push(
        {
          id: 'four_extended',
          label: 'All 4 Fingers Straight and Extended',
          expected: 'Index, middle, ring, pinky all extended',
          actual: `Extended: [${f.fingers.index.isExtended ? 'I' : '-'}, ${f.fingers.middle.isExtended ? 'M' : '-'}, ${f.fingers.ring.isExtended ? 'R' : '-'}, ${f.fingers.pinky.isExtended ? 'P' : '-'}]`,
          passed: allExt,
        },
        {
          id: 'high_spread',
          label: 'Fingers Spread Wide (Blooming Lotus)',
          expected: 'Average spread ≥ 0.35',
          actual: `Spread = ${f.fingerSpread.toFixed(2)}`,
          passed: f.fingerSpread >= 0.35,
        },
        {
          id: 'pairwise_spread',
          label: 'Adjacent Pairs Separated',
          expected: 'I-M, M-R, R-P each ≥ 0.24',
          actual: `[${f.tipDistances.indexMiddle.toFixed(2)}, ${f.tipDistances.middleRing.toFixed(2)}, ${f.tipDistances.ringPinky.toFixed(2)}]`,
          passed: pairwise,
        },
      )
      break
    }

    case 'mayura': {
      checks.push(
        {
          id: 'ring_touches_thumb',
          label: 'Ring Fingertip Touches Thumb Tip',
          expected: 'Distance thumb-to-ring ≤ 0.40',
          actual: `Distance = ${f.tipDistances.thumbRing.toFixed(2)}`,
          passed: f.tipDistances.thumbRing <= 0.4,
        },
        {
          id: 'three_extended',
          label: 'Index, Middle, and Pinky Extended Straight',
          expected: 'Index, middle, pinky straight',
          actual: `Extended: [${f.fingers.index.isExtended ? 'I' : '-'}, ${f.fingers.middle.isExtended ? 'M' : '-'}, ${f.fingers.pinky.isExtended ? 'P' : '-'}]`,
          passed: f.fingers.index.isExtended && f.fingers.middle.isExtended && f.fingers.pinky.isExtended,
        },
        {
          id: 'index_separated',
          label: 'Index Separated from Thumb (Not Bud)',
          expected: 'Distance thumb-to-index > 0.35',
          actual: `Distance = ${f.tipDistances.thumbIndex.toFixed(2)}`,
          passed: f.tipDistances.thumbIndex > 0.35,
        },
      )
      break
    }

    case 'mukula': {
      const tipsNearThumb =
        f.tipDistances.thumbIndex <= 0.48 &&
        f.tipDistances.thumbMiddle <= 0.48 &&
        f.tipDistances.thumbRing <= 0.48 &&
        f.tipDistances.thumbPinky <= 0.48
      checks.push(
        {
          id: 'tight_cluster',
          label: 'All 5 Tips Gathered in Tight Bud',
          expected: 'Centroid cluster radius ≤ 0.38',
          actual: `Radius = ${f.tipDistances.clusterRadius.toFixed(2)}`,
          passed: f.tipDistances.clusterRadius <= 0.38,
        },
        {
          id: 'low_max_spread',
          label: 'Low Maximum Spread Between Tips',
          expected: 'Max spread ≤ 0.68',
          actual: `Max spread = ${f.tipDistances.maxSpread.toFixed(2)}`,
          passed: f.tipDistances.maxSpread <= 0.68,
        },
        {
          id: 'tips_near_thumb',
          label: 'All 4 Fingertips Meet Thumb',
          expected: 'All 4 tip distances to thumb ≤ 0.48',
          actual: `Distances: [${f.tipDistances.thumbIndex.toFixed(2)}, ${f.tipDistances.thumbMiddle.toFixed(2)}, ${f.tipDistances.thumbRing.toFixed(2)}, ${f.tipDistances.thumbPinky.toFixed(2)}]`,
          passed: tipsNearThumb,
        },
      )
      break
    }
  }

  return checks
}

/**
 * Generates human-readable, rule-derived rejection reasons explaining why a specific mudra was not recognized.
 */
export function getMudraRejectionReasons(
  mudraId: MudraId,
  features: HandFeatures | null,
  detailed: MudraRuleDetailedResult,
  stabilizerDiag?: any,
): string[] {
  if (!features) {
    return ['No hand detected in camera view']
  }

  const checks = explainMudraConditions(mudraId, features)
  const failedChecks = checks.filter((c) => !c.passed)
  const reasons: string[] = []

  // 1. Report failed geometric conditions
  for (const c of failedChecks) {
    reasons.push(`${c.label} failed: ${c.actual} (expected: ${c.expected})`)
  }

  // 2. Score threshold check
  const evaluation = detailed.evaluations.find((e) => e.mudra === mudraId)
  if (evaluation && evaluation.score < detailed.thresholds.recognitionMinScore) {
    reasons.push(
      `Match score ${(evaluation.score * 100).toFixed(0)}% is below the recognition threshold (${Math.round(detailed.thresholds.recognitionMinScore * 100)}%)`,
    )
  }

  // 3. Ambiguity margin check
  if (
    evaluation &&
    detailed.topCandidate &&
    detailed.topCandidate.mudra === mudraId &&
    detailed.runnerUp &&
    detailed.margin < detailed.thresholds.ambiguityMargin
  ) {
    reasons.push(
      `Ambiguous candidate margin: runner-up '${detailed.runnerUp.name}' is within ${(detailed.margin * 100).toFixed(1)}% (minimum required margin is ${(detailed.thresholds.ambiguityMargin * 100).toFixed(1)}%)`,
    )
  }

  // 4. Temporal consensus check (if raw matches this mudra but stabilizer hasn't reached threshold)
  if (
    stabilizerDiag &&
    evaluation &&
    detailed.result.status === 'recognized' &&
    detailed.result.mudra === mudraId &&
    stabilizerDiag.currentMudra !== mudraId
  ) {
    reasons.push(
      `Awaiting frame consensus: ${stabilizerDiag.topCandidateCount ?? 0} of ${stabilizerDiag.consensusThreshold} required frames recorded`,
    )
  }

  return reasons
}
