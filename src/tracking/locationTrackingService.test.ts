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
});
