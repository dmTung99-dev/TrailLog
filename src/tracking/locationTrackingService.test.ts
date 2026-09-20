// src/tracking/locationTrackingService.test.ts
jest.mock('react-native-geolocation-service', () => ({
  watchPosition: jest.fn(),
  clearWatch: jest.fn(),
}));
jest.mock('react-native-background-actions', () => ({
  start: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn().mockResolvedValue(undefined),
}));

import Geolocation from 'react-native-geolocation-service';
import { LocationTrackingService } from './locationTrackingService';

describe('LocationTrackingService', () => {
  it('formats a raw geolocation position into a RoutePointInput and assigns an incrementing sequence', () => {
    const onRoutePoint = jest.fn();
    const service = new LocationTrackingService(onRoutePoint);

    (Geolocation.watchPosition as jest.Mock).mockImplementation((success) => {
      success({
        coords: { latitude: 10.123, longitude: 106.456 },
        timestamp: 1_757_000_000_000,
      });
      return 1;
    });

    service.start();

    expect(onRoutePoint).toHaveBeenCalledWith({
      lat: 10.123,
      lng: 106.456,
      recordedAt: new Date(1_757_000_000_000).toISOString(),
      sequence: 0,
    });
  });

  it('increments sequence across multiple points and rejects a second start while recording', () => {
    const onRoutePoint = jest.fn();
    const service = new LocationTrackingService(onRoutePoint);
    let capturedSuccess: (position: any) => void = () => {};

    (Geolocation.watchPosition as jest.Mock).mockImplementation((success) => {
      capturedSuccess = success;
      return 1;
    });

    service.start();
    capturedSuccess({ coords: { latitude: 1, longitude: 1 }, timestamp: 1000 });
    capturedSuccess({ coords: { latitude: 2, longitude: 2 }, timestamp: 2000 });

    expect(onRoutePoint).toHaveBeenNthCalledWith(1, expect.objectContaining({ sequence: 0 }));
    expect(onRoutePoint).toHaveBeenNthCalledWith(2, expect.objectContaining({ sequence: 1 }));
    expect(() => service.start()).toThrow('Cannot START from recording');
  });

  describe('on Android', () => {
    beforeEach(() => {
      jest.resetModules();
    });

    it('starts watching synchronously (before any background task callback can fire) and clears it on pause', () => {
      jest.doMock('react-native/Libraries/Utilities/Platform', () => ({
        OS: 'android',
        select: (obj: any) => obj.android,
      }));
      jest.doMock('react-native-geolocation-service', () => ({
        watchPosition: jest.fn().mockReturnValue(1),
        clearWatch: jest.fn(),
      }));
      jest.doMock('react-native-background-actions', () => ({
        start: jest.fn().mockResolvedValue(undefined),
        stop: jest.fn().mockResolvedValue(undefined),
      }));

      const Geo = require('react-native-geolocation-service');
      const AndroidBackgroundActions = require('react-native-background-actions');
      const { LocationTrackingService: AndroidLocationTrackingService } = require('./locationTrackingService');

      const service = new AndroidLocationTrackingService(jest.fn());
      service.start();

      // watchId must already be set — this is the exact race the review caught:
      // watchPosition used to only run once BackgroundActions' task callback
      // fired on a later tick, so pause() could miss clearWatch entirely.
      expect(Geo.watchPosition).toHaveBeenCalledTimes(1);
      expect(AndroidBackgroundActions.start).toHaveBeenCalledTimes(1);

      service.pause();
      expect(Geo.clearWatch).toHaveBeenCalledWith(1);
    });

    it('keeps the background task promise pending until stop() releases it', async () => {
      jest.doMock('react-native/Libraries/Utilities/Platform', () => ({
        OS: 'android',
        select: (obj: any) => obj.android,
      }));
      jest.doMock('react-native-geolocation-service', () => ({
        watchPosition: jest.fn().mockReturnValue(1),
        clearWatch: jest.fn(),
      }));

      let capturedTask: (() => Promise<void>) | null = null;
      jest.doMock('react-native-background-actions', () => ({
        start: jest.fn().mockImplementation((task: () => Promise<void>) => {
          capturedTask = task;
          return task();
        }),
        stop: jest.fn().mockResolvedValue(undefined),
      }));

      const { LocationTrackingService: AndroidLocationTrackingService } = require('./locationTrackingService');
      const service = new AndroidLocationTrackingService(jest.fn());
      service.start();

      let resolved = false;
      capturedTask!().then(() => {
        resolved = true;
      });
      await Promise.resolve();
      // This is the exact bug the review caught: the old code's task
      // resolved on its own immediately, which the library reads as "done"
      // and tears the foreground service down right away.
      expect(resolved).toBe(false);

      await service.stop();
      expect(resolved).toBe(true);
    });

    it('does not touch the background keep-alive task across a pause()/resume() cycle', async () => {
      jest.doMock('react-native/Libraries/Utilities/Platform', () => ({
        OS: 'android',
        select: (obj: any) => obj.android,
      }));
      jest.doMock('react-native-geolocation-service', () => ({
        watchPosition: jest.fn().mockReturnValue(1),
        clearWatch: jest.fn(),
      }));
      jest.doMock('react-native-background-actions', () => ({
        start: jest.fn().mockResolvedValue(undefined),
        stop: jest.fn().mockResolvedValue(undefined),
      }));

      const AndroidBackgroundActions = require('react-native-background-actions');
      const { LocationTrackingService: AndroidLocationTrackingService } = require('./locationTrackingService');
      const service = new AndroidLocationTrackingService(jest.fn());

      service.start();
      expect(AndroidBackgroundActions.start).toHaveBeenCalledTimes(1);

      service.pause();
      service.resume();

      // Pausing/resuming only toggles GPS watching, not the native
      // background task — deliberately: the installed library ties
      // resolving a task's promise directly to tearing down the *whole*
      // foreground service, so there is no safe way to "restart" it
      // mid-activity. See the design notes below this class for the two
      // approaches that were tried and abandoned before landing here.
      expect(AndroidBackgroundActions.start).toHaveBeenCalledTimes(1);
      expect(AndroidBackgroundActions.stop).not.toHaveBeenCalled();

      await service.stop();
      expect(AndroidBackgroundActions.stop).toHaveBeenCalledTimes(1);
    });
  });
});
