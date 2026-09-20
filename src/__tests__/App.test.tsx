import React from 'react';
import { render, screen } from '@testing-library/react-native';
import App from '../../App';

// App.tsx now gates its initial route on whether a session is already
// stored (see src/store/authStore.ts). Mock AsyncStorage directly (rather
// than tokenStorage or authStore) so this test still exercises the real
// restoreSession()/tokenStorage integration end to end, simulating a
// returning user who already has a token stored.
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue('existing-token'),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

it('renders the Home screen on launch for a returning signed-in user', async () => {
  render(<App />);
  expect(await screen.findByText('TrailLog')).toBeTruthy();
});
