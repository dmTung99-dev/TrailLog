import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { TrackingScreen } from './TrackingScreen';
import { useTrackingStore } from '../store/trackingStore';
import { capturePhoto } from '../camera/cameraService';
import { requestCameraPermission } from '../permissions/permissionsManager';

jest.mock('../store/trackingStore');
jest.mock('../camera/cameraService');
jest.mock('../permissions/permissionsManager', () => ({
  requestCameraPermission: jest.fn().mockResolvedValue('granted'),
}));

describe('TrackingScreen', () => {
  beforeEach(() => {
    (requestCameraPermission as jest.Mock).mockClear().mockResolvedValue('granted');
    (capturePhoto as jest.Mock).mockClear();
  });

  it('shows an idle Start button and calls startActivity when pressed', () => {
    const startActivity = jest.fn();
    (useTrackingStore as unknown as jest.Mock).mockReturnValue({
      status: 'idle',
      stepCount: 0,
      checkpointCount: 0,
      routePoints: [],
      startActivity,
      pauseActivity: jest.fn(),
      resumeActivity: jest.fn(),
      stopActivity: jest.fn(),
      captureCheckpoint: jest.fn(),
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
      routePoints: [],
      startActivity: jest.fn(),
      pauseActivity: jest.fn(),
      resumeActivity: jest.fn(),
      stopActivity: jest.fn(),
      captureCheckpoint: jest.fn(),
    });

    render(<TrackingScreen />);
    expect(screen.getByText('Steps: 42')).toBeTruthy();
  });

  it('captures a photo and records a checkpoint when "Capture checkpoint" is pressed', async () => {
    const captureCheckpoint = jest.fn();
    (capturePhoto as jest.Mock).mockResolvedValue({ path: '/tmp/checkpoint.jpg' });
    (useTrackingStore as unknown as jest.Mock).mockReturnValue({
      status: 'recording',
      stepCount: 10,
      checkpointCount: 0,
      routePoints: [],
      startActivity: jest.fn(),
      pauseActivity: jest.fn(),
      resumeActivity: jest.fn(),
      stopActivity: jest.fn(),
      captureCheckpoint,
    });

    render(<TrackingScreen />);
    fireEvent.press(screen.getByText('Capture checkpoint'));

    await waitFor(() => expect(captureCheckpoint).toHaveBeenCalledWith('/tmp/checkpoint.jpg'));
  });

  it('does not capture a photo or checkpoint when camera permission is denied', async () => {
    (requestCameraPermission as jest.Mock).mockResolvedValueOnce('denied');
    const captureCheckpoint = jest.fn();
    (useTrackingStore as unknown as jest.Mock).mockReturnValue({
      status: 'recording',
      stepCount: 10,
      checkpointCount: 0,
      routePoints: [],
      startActivity: jest.fn(),
      pauseActivity: jest.fn(),
      resumeActivity: jest.fn(),
      stopActivity: jest.fn(),
      captureCheckpoint,
    });

    render(<TrackingScreen />);
    fireEvent.press(screen.getByText('Capture checkpoint'));

    await waitFor(() => expect(requestCameraPermission).toHaveBeenCalled());
    expect(capturePhoto).not.toHaveBeenCalled();
    expect(captureCheckpoint).not.toHaveBeenCalled();
  });
});
