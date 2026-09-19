import { accelerometer, setUpdateIntervalForType, SensorTypes } from 'react-native-sensors';
import { Subscription } from 'rxjs';
import { StepAccumulator } from './stepDetector';

setUpdateIntervalForType(SensorTypes.accelerometer, 20);

export class PedometerService {
  private subscription: Subscription | null = null;
  private accumulator = new StepAccumulator();

  start(onStepCountChange: (count: number) => void): void {
    if (this.subscription) {
      return; // already running; avoid leaking a second subscription
    }
    this.accumulator = new StepAccumulator();
    this.subscription = accelerometer.subscribe(({ x, y, z, timestamp }) => {
      const countedStep = this.accumulator.addSample({ x, y, z, timestamp });
      if (countedStep) {
        onStepCountChange(this.accumulator.stepCount);
      }
    });
  }

  stop(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
  }
}
