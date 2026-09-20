import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import { HistoryScreen } from './HistoryScreen';
import * as repoModule from '../db/activitiesRepository';
import * as syncEngineModule from '../sync/syncEngine';
import { useNavigation } from '@react-navigation/native';

jest.mock('../db/sqliteStorageAdapter', () => ({ createSqliteStorageAdapter: jest.fn() }));
jest.mock('@react-navigation/native', () => ({
  useNavigation: jest.fn(),
}));

describe('HistoryScreen', () => {
  it('renders each activity title from the repository', async () => {
    (useNavigation as jest.Mock).mockReturnValue({
      navigate: jest.fn(),
    });
    jest.spyOn(repoModule, 'createActivitiesRepository').mockReturnValue({
      listActivities: jest.fn().mockResolvedValue([
        { id: '1', title: 'Morning hike', startedAt: '2026-09-06T07:00:00.000Z', routePoints: [], checkpoints: [] },
        { id: '2', title: 'Evening walk', startedAt: '2026-09-05T18:00:00.000Z', routePoints: [], checkpoints: [] },
      ]),
    } as any);

    render(<HistoryScreen />);

    await waitFor(() => expect(screen.getByText('Morning hike')).toBeTruthy());
    expect(screen.getByText('Evening walk')).toBeTruthy();
  });

  it('runs sync and shows a summary when "Sync now" is pressed', async () => {
    (useNavigation as jest.Mock).mockReturnValue({
      navigate: jest.fn(),
    });
    jest.spyOn(repoModule, 'createActivitiesRepository').mockReturnValue({
      listActivities: jest.fn().mockResolvedValue([]),
    } as any);
    const syncNow = jest.fn().mockResolvedValue({ synced: 2, conflicts: 1, failed: 0 });
    jest.spyOn(syncEngineModule, 'createSyncEngine').mockReturnValue({ syncNow });

    render(<HistoryScreen />);
    fireEvent.press(screen.getByText('Sync now'));

    await waitFor(() => expect(screen.getByText('Synced 2, 1 conflict')).toBeTruthy());
  });
});
