import React from 'react';
import { render, screen } from '@testing-library/react-native';
import App from '../../App';

it('renders the Home screen on launch', () => {
  render(<App />);
  expect(screen.getByText('TrailLog')).toBeTruthy();
});
