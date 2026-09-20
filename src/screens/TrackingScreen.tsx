import React, { useRef } from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';
import { Camera, useCameraDevice } from 'react-native-vision-camera';
import MapView, { Polyline } from 'react-native-maps';
import { useTrackingStore } from '../store/trackingStore';
import { capturePhoto } from '../camera/cameraService';
import { requestCameraPermission } from '../permissions/permissionsManager';

export function TrackingScreen() {
  const {
    status,
    stepCount,
    checkpointCount,
    routePoints,
    startActivity,
    pauseActivity,
    resumeActivity,
    stopActivity,
    captureCheckpoint,
  } = useTrackingStore();
  const cameraRef = useRef<Camera>(null);
  const device = useCameraDevice('back');

  const onCapturePress = async () => {
    if (!cameraRef.current) return;
    const permission = await requestCameraPermission();
    if (permission !== 'granted') return;
    const photo = await capturePhoto(cameraRef.current);
    await captureCheckpoint(photo.path);
  };

  return (
    <View style={styles.container}>
      {routePoints.length > 0 && (
        <MapView
          style={styles.map}
          initialRegion={{
            latitude: routePoints[0].lat,
            longitude: routePoints[0].lng,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
        >
          <Polyline coordinates={routePoints.map((p) => ({ latitude: p.lat, longitude: p.lng }))} />
        </MapView>
      )}

      <Text style={styles.stat}>Steps: {stepCount}</Text>
      <Text style={styles.stat}>Checkpoints: {checkpointCount}</Text>

      {status === 'idle' && <Button title="Start" onPress={startActivity} />}
      {status === 'recording' && (
        <>
          <Button title="Pause" onPress={pauseActivity} />
          <Button title="Capture checkpoint" onPress={onCapturePress} />
          <Button title="Stop" onPress={stopActivity} />
        </>
      )}
      {status === 'paused' && (
        <>
          <Button title="Resume" onPress={resumeActivity} />
          <Button title="Stop" onPress={stopActivity} />
        </>
      )}

      {status === 'recording' && device && (
        <Camera ref={cameraRef} style={styles.hiddenCamera} device={device} photo isActive />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  map: { width: '100%', height: 200 },
  stat: { fontSize: 18 },
  hiddenCamera: { width: 1, height: 1, opacity: 0 },
});
