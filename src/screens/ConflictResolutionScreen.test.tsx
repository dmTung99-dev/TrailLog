import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { ConflictResolutionScreen } from './ConflictResolutionScreen';
import * as repoModule from '../db/activitiesRepository';

jest.mock('../db/sqliteStorageAdapter', () => ({ createSqliteStorageAdapter: jest.fn() }));

describe('ConflictResolutionScreen', () => {
  const localActivity = {
    id: 'local-1',
    title: 'My renamed hike',
    conflictServerActivity: JSON.stringify({ id: 'server-1', title: 'Server renamed hike', updatedAt: '2026-09-21T12:00:00.000Z' }),
  };

  it('shows both versions and lets the user keep the local one', async () => {
    const updateActivityMetadata = jest.fn();
    const markActivitySynced = jest.fn();
    jest.spyOn(repoModule, 'createActivitiesRepository').mockReturnValue({
      getActivity: jest.fn().mockResolvedValue(localActivity),
      updateActivityMetadata,
      markActivitySynced,
    } as any);

    render(<ConflictResolutionScreen route={{ params: { activityId: 'local-1' } } as any} />);

    await waitFor(() => expect(screen.getByText('My renamed hike')).toBeTruthy());
    expect(screen.getByText('Server renamed hike')).toBeTruthy();

    fireEvent.press(screen.getByText('Keep mine'));

    await waitFor(() => expect(markActivitySynced).toHaveBeenCalledWith('local-1', 'server-1', '2026-09-21T12:00:00.000Z'));
  });

  it('lets the user take the server version instead', async () => {
    const updateActivityMetadata = jest.fn();
    const markActivitySynced = jest.fn();
    jest.spyOn(repoModule, 'createActivitiesRepository').mockReturnValue({
      getActivity: jest.fn().mockResolvedValue(localActivity),
      updateActivityMetadata,
      markActivitySynced,
    } as any);

    render(<ConflictResolutionScreen route={{ params: { activityId: 'local-1' } } as any} />);
    await waitFor(() => expect(screen.getByText('My renamed hike')).toBeTruthy());

    fireEvent.press(screen.getByText('Take server version'));

    await waitFor(() => expect(updateActivityMetadata).toHaveBeenCalledWith('local-1', { title: 'Server renamed hike' }));
  });
});
