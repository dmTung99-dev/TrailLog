import React from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';
import { useTrackingStore } from '../store/trackingStore';

export function TrackingScreen() {
  const { status, stepCount, checkpointCount, startActivity, pauseActivity, resumeActivity, stopActivity } =
    useTrackingStore();

  return (
    <View style={styles.container}>
      <Text style={styles.stat}>Steps: {stepCount}</Text>
      <Text style={styles.stat}>Checkpoints: {checkpointCount}</Text>

      {status === 'idle' && <Button title="Start" onPress={startActivity} />}
      {status === 'recording' && (
        <>
          <Button title="Pause" onPress={pauseActivity} />
          <Button title="Stop" onPress={stopActivity} />
        </>
      )}
      {status === 'paused' && (
        <>
          <Button title="Resume" onPress={resumeActivity} />
          <Button title="Stop" onPress={stopActivity} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  stat: { fontSize: 18 },
});
