export const RESULTS = {
  GRANTED: 'granted',
  DENIED: 'denied',
  BLOCKED: 'blocked',
  UNAVAILABLE: 'unavailable',
};

export const PERMISSIONS = {
  ANDROID: {
    ACCESS_FINE_LOCATION: 'android.permission.ACCESS_FINE_LOCATION',
    ACCESS_COARSE_LOCATION: 'android.permission.ACCESS_COARSE_LOCATION',
    CAMERA: 'android.permission.CAMERA',
  },
  IOS: {
    LOCATION_WHEN_IN_USE: 'ios.permission.LOCATION_WHEN_IN_USE',
    CAMERA: 'ios.permission.CAMERA',
    MOTION: 'ios.permission.MOTION',
  },
};

export const check = jest.fn();
export const request = jest.fn();
