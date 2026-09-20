// src/tracking/locationTrackingService.ts
import Geolocation from 'react-native-geolocation-service';
import BackgroundActions from 'react-native-background-actions';
import { Platform } from 'react-native';
import { RoutePointInput } from '../db/activitiesRepository';
import { TrackingStateMachine } from './trackingStateMachine';

const BACKGROUND_TASK_OPTIONS = {
  taskName: 'TrailLog',
  taskTitle: 'Recording your route',
  taskDesc: 'TrailLog is tracking your location in the background',
  taskIcon: { name: 'ic_launcher', type: 'mipmap' },
  parameters: {},
};

export class LocationTrackingService {
  private readonly stateMachine = new TrackingStateMachine();
  private watchId: number | null = null;
  private sequence = 0;
  private releaseBackgroundTask: (() => void) | null = null;

  constructor(
    private readonly onRoutePoint: (point: RoutePointInput) => void,
    private readonly onError?: (error: unknown) => void,
  ) {}

  private reportError(error: unknown): void {
    if (this.onError) {
      this.onError(error);
    } else {
      console.warn('[LocationTrackingService]', error);
    }
  }

  get state() {
    return this.stateMachine.state;
  }

  start(): void {
    this.stateMachine.transition('START');
    this.sequence = 0;
    if (Platform.OS === 'android') {
      // Started exactly once per activity, here — never from pause()/
      // resume(). See the design notes below this class for why.
      this.startBackgroundKeepAlive();
    }
    this.beginWatching();
  }

  pause(): void {
    this.stateMachine.transition('PAUSE');
    this.stopWatching();
    // Deliberately does not touch the background keep-alive task — see
    // the design notes below this class.
  }

  resume(): void {
    this.stateMachine.transition('RESUME');
    this.beginWatching();
  }

  async stop(): Promise<void> {
    this.stateMachine.transition('STOP');
    this.stopWatching();
    await this.stopBackgroundKeepAlive();
  }

  private beginWatching(): void {
    this.watchId = Geolocation.watchPosition(
      (position) => {
        this.onRoutePoint({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          recordedAt: new Date(position.timestamp).toISOString(),
          sequence: this.sequence,
        });
        this.sequence += 1;
      },
      (error) => {
        this.reportError(error);
      },
      { enableHighAccuracy: true, distanceFilter: 5, interval: 5000 },
    );
    // iOS: relies on UIBackgroundModes: ["location"] in Info.plist; no
    // separate keep-alive task exists or is needed there.
  }

  private stopWatching(): void {
    if (this.watchId !== null) {
      Geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  private startBackgroundKeepAlive(): void {
    // BackgroundActions treats a resolved task promise as "the task is
    // done" and immediately tears the foreground service down — so this
    // promise must stay pending until stopBackgroundKeepAlive() releases
    // it, never resolve on its own. There is deliberately no "restart"
    // path for this task anywhere in this class (see the design notes).
    BackgroundActions.start(
      () =>
        new Promise<void>((resolve) => {
          this.releaseBackgroundTask = resolve;
        }),
      BACKGROUND_TASK_OPTIONS,
    ).catch((error: unknown) => {
      this.reportError(error);
    });
  }

  private async stopBackgroundKeepAlive(): Promise<void> {
    if (Platform.OS !== 'android') {
      return;
    }
    this.releaseBackgroundTask?.();
    this.releaseBackgroundTask = null;
    try {
      await BackgroundActions.stop();
    } catch (error: unknown) {
      this.reportError(error);
    }
  }
}
