import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';

export function HomeScreen() {
  const navigation = useNavigation<any>();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>TrailLog</Text>
      <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('Tracking')}>
        <Text style={styles.buttonText}>Track</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('History')}>
        <Text style={styles.buttonText}>History</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '600' },
  button: { marginTop: 16, paddingVertical: 12, paddingHorizontal: 24 },
  buttonText: { fontSize: 18 },
});
