import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import { HistoryScreen } from './HistoryScreen';
import * as repoModule from '../db/activitiesRepository';
import * as syncEngineModule from '../sync/syncEngine';
import { useNavigation } from '@react-navigation/native';

jest.mock('../db/sqliteStorageAdapter', () => ({ createSqliteStorageAdapter: jest.fn() }));
jest.mock('@react-navigation/native', () => {
  const actualReact = require('react');
  return {
    useNavigation: jest.fn(),
    // Outside a real NavigationContainer there is no focus/blur event to
    // subscribe to, so this stand-in runs the effect the same way
    // useEffect would on mount — enough to prove HistoryScreen refetches
    // via useFocusEffect rather than a mount-only effect.
    useFocusEffect: jest.fn((effect: () => void) => actualReact.useEffect(effect, [])),
  };
});

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

  it('refetches activities after a sync completes, so a freshly-conflicted row shows up without remounting', async () => {
    (useNavigation as jest.Mock).mockReturnValue({
      navigate: jest.fn(),
    });
    const listActivities = jest
      .fn()
      .mockResolvedValueOnce([
        { id: '1', title: 'Morning hike', startedAt: '2026-09-06T07:00:00.000Z', syncStatus: 'pending', routePoints: [], checkpoints: [] },
      ])
      .mockResolvedValueOnce([
        { id: '1', title: 'Morning hike', startedAt: '2026-09-06T07:00:00.000Z', syncStatus: 'conflict', routePoints: [], checkpoints: [] },
      ]);
    jest.spyOn(repoModule, 'createActivitiesRepository').mockReturnValue({ listActivities } as any);
    const syncNow = jest.fn().mockResolvedValue({ synced: 0, conflicts: 1, failed: 0 });
    jest.spyOn(syncEngineModule, 'createSyncEngine').mockReturnValue({ syncNow });

    render(<HistoryScreen />);
    await waitFor(() => expect(screen.getByText('Not synced')).toBeTruthy());

    fireEvent.press(screen.getByText('Sync now'));

    // The row's status flips from "Not synced" to "Conflict" only if the
    // list is refetched after syncNow() resolves — a mount-only load would
    // leave the stale first snapshot on screen forever.
    await waitFor(() => expect(screen.getByText('Conflict')).toBeTruthy());
    expect(listActivities).toHaveBeenCalledTimes(2);
  });

  it('ignores a second "Sync now" press while a sync is already in flight', async () => {
    (useNavigation as jest.Mock).mockReturnValue({
      navigate: jest.fn(),
    });
    jest.spyOn(repoModule, 'createActivitiesRepository').mockReturnValue({
      listActivities: jest.fn().mockResolvedValue([]),
    } as any);
    let resolveSyncNow: (summary: { synced: number; conflicts: number; failed: number }) => void = () => {};
    const syncNow = jest.fn().mockImplementation(
      () => new Promise((resolve) => { resolveSyncNow = resolve; }),
    );
    jest.spyOn(syncEngineModule, 'createSyncEngine').mockReturnValue({ syncNow });

    render(<HistoryScreen />);
    fireEvent.press(screen.getByText('Sync now'));
    fireEvent.press(screen.getByText('Sync now')); // second press while the first is still pending

    // onSyncPress awaits createSqliteStorageAdapter() before it ever calls
    // engine.syncNow(), so syncNow's mock isn't actually invoked (and
    // resolveSyncNow isn't reassigned to its real resolver) until that
    // microtask chain runs. Wait for the real invocation before resolving,
    // otherwise resolveSyncNow would still be firing the initial no-op.
    await waitFor(() => expect(syncNow).toHaveBeenCalledTimes(1));

    resolveSyncNow({ synced: 1, conflicts: 0, failed: 0 });
    await waitFor(() => expect(screen.getByText('Synced 1, 0 conflicts')).toBeTruthy());

    expect(syncNow).toHaveBeenCalledTimes(1);
  });

  it('shows a Resolve button only for a conflicted activity, navigating to ConflictResolution', async () => {
    const navigate = jest.fn();
    (useNavigation as jest.Mock).mockReturnValue({ navigate });
    jest.spyOn(repoModule, 'createActivitiesRepository').mockReturnValue({
      listActivities: jest.fn().mockResolvedValue([
        { id: '1', title: 'Conflicted hike', startedAt: '2026-09-21T07:00:00.000Z', syncStatus: 'conflict', routePoints: [], checkpoints: [] },
        { id: '2', title: 'Synced walk', startedAt: '2026-09-20T18:00:00.000Z', syncStatus: 'synced', routePoints: [], checkpoints: [] },
      ]),
    } as any);

    render(<HistoryScreen />);
    await waitFor(() => expect(screen.getByText('Conflicted hike')).toBeTruthy());

    // Only the conflicted row gets a Resolve button.
    expect(screen.getAllByText('Resolve')).toHaveLength(1);

    fireEvent.press(screen.getByText('Resolve'));
    expect(navigate).toHaveBeenCalledWith('ConflictResolution', { activityId: '1' });
  });
});
