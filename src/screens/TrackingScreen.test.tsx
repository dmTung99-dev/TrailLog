import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { TrackingScreen } from './TrackingScreen';
import { useTrackingStore } from '../store/trackingStore';

jest.mock('../store/trackingStore');

describe('TrackingScreen', () => {
  it('shows an idle Start button and calls startActivity when pressed', () => {
    const startActivity = jest.fn();
    (useTrackingStore as unknown as jest.Mock).mockReturnValue({
      status: 'idle',
      stepCount: 0,
      checkpointCount: 0,
      startActivity,
      pauseActivity: jest.fn(),
      resumeActivity: jest.fn(),
      stopActivity: jest.fn(),
    });

    render(<TrackingScreen />);
    fireEvent.press(screen.getByText('Start'));
    expect(startActivity).toHaveBeenCalled();
  });

  it('shows live step count while recording', () => {
    (useTrackingStore as unknown as jest.Mock).mockReturnValue({
      status: 'recording',
      stepCount: 42,
      checkpointCount: 1,
      startActivity: jest.fn(),
      pauseActivity: jest.fn(),
      resumeActivity: jest.fn(),
      stopActivity: jest.fn(),
    });

    render(<TrackingScreen />);
    expect(screen.getByText('Steps: 42')).toBeTruthy();
  });
});
