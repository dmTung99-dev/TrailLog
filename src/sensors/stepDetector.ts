export interface AccelerometerSample {
  x: number;
  y: number;
  z: number;
  timestamp: number; // milliseconds
}

const GRAVITY = 9.8;
const PEAK_THRESHOLD = 2.0; // magnitude delta from gravity that counts as a step peak
const MIN_STEP_INTERVAL_MS = 250; // debounce: no human takes two steps faster than this

export function detectSteps(samples: AccelerometerSample[]): number {
  let steps = 0;
  let lastPeakTimestamp = -Infinity;
  let wasAboveThreshold = false;

  for (const sample of samples) {
    const magnitude = Math.sqrt(sample.x ** 2 + sample.y ** 2 + sample.z ** 2);
    const delta = magnitude - GRAVITY;
    const isAboveThreshold = delta > PEAK_THRESHOLD;

    if (isAboveThreshold && !wasAboveThreshold && sample.timestamp - lastPeakTimestamp >= MIN_STEP_INTERVAL_MS) {
      steps += 1;
      lastPeakTimestamp = sample.timestamp;
    }
    wasAboveThreshold = isAboveThreshold;
  }

  return steps;
}
