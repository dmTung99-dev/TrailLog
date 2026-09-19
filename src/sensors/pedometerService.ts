import { accelerometer, setUpdateIntervalForType, SensorTypes } from 'react-native-sensors';
import { Subscription } from 'rxjs';
import { AccelerometerSample, detectSteps } from './stepDetector';

setUpdateIntervalForType(SensorTypes.accelerometer, 20);

export class PedometerService {
  private subscription: Subscription | null = null;
  private buffer: AccelerometerSample[] = [];
  private stepCount = 0;

  start(onStepCountChange: (count: number) => void): void {
    this.buffer = [];
    this.stepCount = 0;
    this.subscription = accelerometer.subscribe(({ x, y, z, timestamp }) => {
      this.buffer.push({ x, y, z, timestamp });
      // Re-run detection on a rolling window so a step spanning the buffer boundary isn't missed.
      const recentWindow = this.buffer.slice(-50);
      const newCount = detectSteps(recentWindow);
      if (newCount !== this.stepCount) {
        this.stepCount = newCount;
        onStepCountChange(this.stepCount);
      }
    });
  }

  stop(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
  }
}
