import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HomeScreen } from './src/screens/HomeScreen';
import { TrackingScreen } from './src/screens/TrackingScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { ActivitySummaryScreen } from './src/screens/ActivitySummaryScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { RegisterScreen } from './src/screens/RegisterScreen';
import { ConflictResolutionScreen } from './src/screens/ConflictResolutionScreen';
import { useAuthStore } from './src/store/authStore';

export type RootStackParamList = {
  Home: undefined;
  Tracking: undefined;
  History: undefined;
  ActivitySummary: { activityId: string };
  Login: undefined;
  Register: undefined;
  ConflictResolution: { activityId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const { status, restoreSession } = useAuthStore();

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  if (status === 'checking') {
    // A splash/loading view would go here in a later polish pass.
    return null;
  }

  // The navigator only ever mounts once `status` has settled to
  // 'signedIn' or 'signedOut', so `initialRouteName` (read by React
  // Navigation only on first mount) always reflects the resolved session.
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName={status === 'signedIn' ? 'Home' : 'Login'}>
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'TrailLog' }} />
        <Stack.Screen name="Tracking" component={TrackingScreen} options={{ title: 'Track activity' }} />
        <Stack.Screen name="History" component={HistoryScreen} options={{ title: 'History' }} />
        <Stack.Screen name="ActivitySummary" component={ActivitySummaryScreen} options={{ title: 'Summary' }} />
        <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Log In' }} />
        <Stack.Screen name="Register" component={RegisterScreen} options={{ title: 'Register' }} />
        <Stack.Screen name="ConflictResolution" component={ConflictResolutionScreen} options={{ title: 'Resolve conflict' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
