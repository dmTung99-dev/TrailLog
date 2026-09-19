import { detectSteps, AccelerometerSample } from './stepDetector';

function flatSamples(count: number): AccelerometerSample[] {
  return Array.from({ length: count }, (_, i) => ({ x: 0, y: 0, z: 9.8, timestamp: i * 20 }));
}

function walkingSamples(steps: number): AccelerometerSample[] {
  // One step ≈ one full sine-like oscillation in the vertical axis every ~500ms.
  const samples: AccelerometerSample[] = [];
  const samplesPerStep = 25; // 20ms interval × 25 = 500ms per step
  for (let i = 0; i < steps * samplesPerStep; i += 1) {
    const phase = (i % samplesPerStep) / samplesPerStep;
    const z = 9.8 + Math.sin(phase * 2 * Math.PI) * 4; // swings well above/below the 2.0 g-delta threshold
    samples.push({ x: 0, y: 0, z, timestamp: i * 20 });
  }
  return samples;
}

describe('detectSteps', () => {
  it('counts zero steps when the device is still', () => {
    expect(detectSteps(flatSamples(100))).toBe(0);
  });

  it('counts roughly one step per oscillation while walking', () => {
    const steps = detectSteps(walkingSamples(10));
    expect(steps).toBeGreaterThanOrEqual(8);
    expect(steps).toBeLessThanOrEqual(10);
  });

  it('ignores small jitter below the step threshold', () => {
    const jitter: AccelerometerSample[] = Array.from({ length: 100 }, (_, i) => ({
      x: 0,
      y: 0,
      z: 9.8 + Math.sin(i) * 0.3,
      timestamp: i * 20,
    }));
    expect(detectSteps(jitter)).toBe(0);
  });
});
