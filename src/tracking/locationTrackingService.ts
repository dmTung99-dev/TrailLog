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

  constructor(private readonly onRoutePoint: (point: RoutePointInput) => void) {}

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
    if (this.watchId !== null) {
      Geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  resume(): void {
    this.stateMachine.transition('RESUME');
    this.beginWatching();
  }

  stop(): void {
    this.stateMachine.transition('STOP');
    if (this.watchId !== null) {
      Geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    if (Platform.OS === 'android') {
      BackgroundActions.stop();
    }
  }

  private beginWatching(): void {
    const watch = () => {
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
        () => {
          /* Errors surface to the UI via the tracking store in Task 6, not thrown here. */
        },
        { enableHighAccuracy: true, distanceFilter: 5, interval: 5000 },
      );
    };

    if (Platform.OS === 'android') {
      // Keeps the process alive in the background via a foreground service notification.
      BackgroundActions.start(async () => watch(), BACKGROUND_TASK_OPTIONS);
    } else {
      watch(); // iOS: relies on UIBackgroundModes: ["location"] in Info.plist.
    }
  }
}
