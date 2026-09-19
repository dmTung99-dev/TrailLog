// src/camera/cameraService.ts
import { Camera } from 'react-native-vision-camera';

export interface CapturedPhoto {
  path: string;
}

export async function capturePhoto(camera: Camera): Promise<CapturedPhoto> {
  const photo = await camera.takePhoto({ flash: 'off' });
  return { path: photo.path };
}
