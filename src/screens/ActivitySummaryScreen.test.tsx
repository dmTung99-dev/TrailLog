import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { ActivitySummaryScreen } from './ActivitySummaryScreen';
import * as repoModule from '../db/activitiesRepository';

jest.mock('../db/sqliteStorageAdapter', () => ({ createSqliteStorageAdapter: jest.fn() }));

describe('ActivitySummaryScreen', () => {
  it('shows the route point count and checkpoint count for the given activity', async () => {
    jest.spyOn(repoModule, 'createActivitiesRepository').mockReturnValue({
      getActivity: jest.fn().mockResolvedValue({
        id: '1',
        title: 'Morning hike',
        startedAt: '2026-09-06T07:00:00.000Z',
        routePoints: [{}, {}, {}],
        checkpoints: [{}],
      }),
    } as any);

    render(<ActivitySummaryScreen route={{ params: { activityId: '1' } } as any} />);

    await waitFor(() => expect(screen.getByText('Morning hike')).toBeTruthy());
    expect(screen.getByText('3 route points')).toBeTruthy();
    expect(screen.getByText('1 checkpoint')).toBeTruthy();
  });

  it('shows a loading state before the fetch resolves', async () => {
    let resolveGetActivity: (value: any) => void = () => {};
    jest.spyOn(repoModule, 'createActivitiesRepository').mockReturnValue({
      getActivity: jest.fn().mockReturnValue(
        new Promise((resolve) => {
          resolveGetActivity = resolve;
        }),
      ),
    } as any);

    render(<ActivitySummaryScreen route={{ params: { activityId: '1' } } as any} />);

    expect(screen.getByText('Loading...')).toBeTruthy();

    resolveGetActivity({
      id: '1',
      title: 'Morning hike',
      startedAt: '2026-09-06T07:00:00.000Z',
      routePoints: [],
      checkpoints: [],
    });
    await waitFor(() => expect(screen.getByText('Morning hike')).toBeTruthy());
  });

  it('shows a not-found state when the activity does not exist', async () => {
    jest.spyOn(repoModule, 'createActivitiesRepository').mockReturnValue({
      getActivity: jest.fn().mockResolvedValue(null),
    } as any);

    render(<ActivitySummaryScreen route={{ params: { activityId: 'missing' } } as any} />);

    await waitFor(() => expect(screen.getByText('Activity not found')).toBeTruthy());
  });
});
