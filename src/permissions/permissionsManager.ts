import { PERMISSIONS, RESULTS, check, request } from 'react-native-permissions';
import { Platform } from 'react-native';

export type NormalizedPermission = 'granted' | 'denied' | 'restricted' | 'approximate-only';

export function normalizeLocationResult(
  fineResult: (typeof RESULTS)[keyof typeof RESULTS],
  coarseResult: (typeof RESULTS)[keyof typeof RESULTS],
): NormalizedPermission {
  if (fineResult === RESULTS.GRANTED) {
    return 'granted';
  }
  if (fineResult === RESULTS.BLOCKED || coarseResult === RESULTS.BLOCKED) {
    return 'restricted';
  }
  if (coarseResult === RESULTS.GRANTED) {
    return 'approximate-only';
  }
  return 'denied';
}

export async function requestLocationPermission(): Promise<NormalizedPermission> {
  const finePermission =
    Platform.OS === 'android' ? PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION : PERMISSIONS.IOS.LOCATION_WHEN_IN_USE;
  const coarsePermission =
    Platform.OS === 'android' ? PERMISSIONS.ANDROID.ACCESS_COARSE_LOCATION : PERMISSIONS.IOS.LOCATION_WHEN_IN_USE;

  const fineResult = await request(finePermission);
  const coarseResult = Platform.OS === 'android' ? await request(coarsePermission) : fineResult;

  return normalizeLocationResult(fineResult, coarseResult);
}

export async function requestCameraPermission(): Promise<NormalizedPermission> {
  const permission = Platform.OS === 'android' ? PERMISSIONS.ANDROID.CAMERA : PERMISSIONS.IOS.CAMERA;
  const result = await request(permission);
  if (result === RESULTS.GRANTED) {
    return 'granted';
  }
  if (result === RESULTS.BLOCKED) {
    return 'restricted';
  }
  return 'denied';
}

export async function requestMotionPermission(): Promise<NormalizedPermission> {
  if (Platform.OS !== 'ios') {
    // Android has no separate motion permission for step counting via accelerometer.
    return 'granted';
  }
  const result = await request(PERMISSIONS.IOS.MOTION);
  if (result === RESULTS.GRANTED) {
    return 'granted';
  }
  if (result === RESULTS.BLOCKED) {
    return 'restricted';
  }
  return 'denied';
}

export async function checkLocationPermission(): Promise<NormalizedPermission> {
  const finePermission =
    Platform.OS === 'android' ? PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION : PERMISSIONS.IOS.LOCATION_WHEN_IN_USE;
  const coarsePermission =
    Platform.OS === 'android' ? PERMISSIONS.ANDROID.ACCESS_COARSE_LOCATION : PERMISSIONS.IOS.LOCATION_WHEN_IN_USE;
  const fineResult = await check(finePermission);
  const coarseResult = Platform.OS === 'android' ? await check(coarsePermission) : fineResult;
  return normalizeLocationResult(fineResult, coarseResult);
}
