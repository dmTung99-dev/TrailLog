export interface AccelerometerSample {
  x: number;
  y: number;
  z: number;
  timestamp: number; // milliseconds
}

const GRAVITY = 9.8;
const PEAK_THRESHOLD = 2.0; // magnitude delta from gravity that counts as a step peak
const MIN_STEP_INTERVAL_MS = 250; // debounce: no human takes two steps faster than this

/**
 * Carries peak-detection state across calls so steps can be counted
 * incrementally, one sample at a time, without losing state at a
 * buffer/window boundary. `detectSteps` below uses a fresh accumulator
 * internally for one-shot batch counting; `PedometerService` (this file's
 * sibling) keeps one accumulator alive for an entire tracking session so
 * the count only ever goes up, instead of re-deriving a bounded count from
 * a sliding window on every sample.
 */
export class StepAccumulator {
  private lastPeakTimestamp = -Infinity;
  private wasAboveThreshold = false;
  private steps = 0;

  get stepCount(): number {
    return this.steps;
  }

  /** Returns true if this sample was just counted as a new step. */
  addSample(sample: AccelerometerSample): boolean {
    const magnitude = Math.sqrt(sample.x ** 2 + sample.y ** 2 + sample.z ** 2);
    const delta = magnitude - GRAVITY;
    const isAboveThreshold = delta > PEAK_THRESHOLD;

    let countedStep = false;
    if (
      isAboveThreshold &&
      !this.wasAboveThreshold &&
      sample.timestamp - this.lastPeakTimestamp >= MIN_STEP_INTERVAL_MS
    ) {
      this.steps += 1;
      this.lastPeakTimestamp = sample.timestamp;
      countedStep = true;
    }
    this.wasAboveThreshold = isAboveThreshold;
    return countedStep;
  }
}

export function detectSteps(samples: AccelerometerSample[]): number {
  const accumulator = new StepAccumulator();
  for (const sample of samples) {
    accumulator.addSample(sample);
  }
  return accumulator.stepCount;
}
