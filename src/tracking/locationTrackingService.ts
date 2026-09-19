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
  private backgroundKeepAliveActive = false;
  // Distinguishes "this specific startBackgroundKeepAlive() call is still
  // the current one" from "some keep-alive session is active" — needed
  // because pause() immediately followed by resume() flips
  // backgroundKeepAliveActive back to true before the native side ever
  // invokes the *first* task's callback, so that flag alone can't tell a
  // superseded (stale) task apart from the current one. See the design
  // note below this class.
  private backgroundKeepAliveGeneration = 0;
  private releaseBackgroundTask: (() => void) | null = null;

  constructor(
    private readonly onRoutePoint: (point: RoutePointInput) => void,
    private readonly onError?: (error: unknown) => void,
  ) {}

  get state() {
    return this.stateMachine.state;
  }

  start(): void {
    this.stateMachine.transition('START');
    this.sequence = 0;
    this.beginWatching();
  }

  pause(): void {
    this.stateMachine.transition('PAUSE');
    this.stopWatching();
    this.stopBackgroundKeepAlive();
  }

  resume(): void {
    this.stateMachine.transition('RESUME');
    this.beginWatching();
  }

  stop(): void {
    this.stateMachine.transition('STOP');
    this.stopWatching();
    this.stopBackgroundKeepAlive();
  }

  private beginWatching(): void {
    // watchPosition is called synchronously, right here, so watchId is
    // always set before this method returns — pause()/stop() can never
    // race a late-firing background task callback (see the design note
    // below this class).
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

    if (Platform.OS === 'android') {
      this.startBackgroundKeepAlive();
    }
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
    if (this.backgroundKeepAliveActive) {
      return; // already running — set synchronously below, so this can
      // never be fooled by how late the native side gets around to
      // actually invoking the task callback (see the design note).
    }
    this.backgroundKeepAliveActive = true;
    const generation = ++this.backgroundKeepAliveGeneration;

    // BackgroundActions treats a resolved task promise as "the task is
    // done" and immediately tears the foreground service down — so this
    // promise must stay pending until stopBackgroundKeepAlive() releases
    // it, never resolve on its own. Exception: if we've already moved
    // past this particular call by the time the native side finally
    // invokes its callback — either stopped/paused entirely, or
    // superseded by a later startBackgroundKeepAlive() call (e.g. a
    // pause() immediately followed by resume()) — resolve immediately
    // instead of parking a resolver nothing will ever call.
    BackgroundActions.start(
      () =>
        new Promise<void>((resolve) => {
          if (!this.backgroundKeepAliveActive || generation !== this.backgroundKeepAliveGeneration) {
            resolve();
            return;
          }
          this.releaseBackgroundTask = resolve;
        }),
      BACKGROUND_TASK_OPTIONS,
    ).catch((error: unknown) => {
      this.reportError(error);
    });
  }

  private stopBackgroundKeepAlive(): void {
    if (Platform.OS !== 'android') {
      return;
    }
    this.backgroundKeepAliveActive = false;
    this.releaseBackgroundTask?.();
    this.releaseBackgroundTask = null;
    BackgroundActions.stop().catch((error: unknown) => {
      this.reportError(error);
    });
  }

  private reportError(error: unknown): void {
    if (this.onError) {
      this.onError(error);
    } else {
      console.warn('[LocationTrackingService]', error);
    }
  }
}
