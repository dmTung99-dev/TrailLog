import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HomeScreen } from './src/screens/HomeScreen';
import { TrackingScreen } from './src/screens/TrackingScreen';

export type RootStackParamList = {
  Home: undefined;
  Tracking: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Home">
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'TrailLog' }} />
        <Stack.Screen name="Tracking" component={TrackingScreen} options={{ title: 'Track activity' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
