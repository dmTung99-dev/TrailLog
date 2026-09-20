import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { HistoryScreen } from './HistoryScreen';
import * as repoModule from '../db/activitiesRepository';
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
});
