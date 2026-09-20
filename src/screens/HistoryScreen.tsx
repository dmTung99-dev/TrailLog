import React, { useCallback, useState } from 'react';
import { Button, FlatList, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Activity, createActivitiesRepository } from '../db/activitiesRepository';
import { createSqliteStorageAdapter } from '../db/sqliteStorageAdapter';
import { createSyncEngine, SyncSummary } from '../sync/syncEngine';
import { apiClient } from '../store/authStore';

export function HistoryScreen() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [syncSummary, setSyncSummary] = useState<SyncSummary | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const navigation = useNavigation<any>();

  const loadActivities = useCallback(async () => {
    const db = await createSqliteStorageAdapter();
    const repo = createActivitiesRepository(db);
    setActivities(await repo.listActivities());
  }, []);

  // Refetches every time this screen becomes focused — covers both the
  // screen's own first mount and returning from ConflictResolutionScreen
  // after resolving a conflict, replacing a mount-only effect that left a
  // freshly-resolved row's status stale until the whole screen remounted.
  useFocusEffect(
    useCallback(() => {
      loadActivities();
    }, [loadActivities]),
  );

  const onSyncPress = async () => {
    if (isSyncing) {
      return; // ignore a re-entrant press while a sync is already running
    }
    setIsSyncing(true);
    try {
      const db = await createSqliteStorageAdapter();
      const repo = createActivitiesRepository(db);
      const engine = createSyncEngine(repo, apiClient);
      const summary = await engine.syncNow();
      setSyncSummary(summary);
      await loadActivities(); // reflect any newly-synced/conflicted rows immediately
    } finally {
      setIsSyncing(false);
    }
  };

  const summaryText = (summary: SyncSummary) =>
    `Synced ${summary.synced}, ${summary.conflicts} conflict${summary.conflicts === 1 ? '' : 's'}`;

  return (
    <View>
      <Button title="Sync now" onPress={onSyncPress} disabled={isSyncing} />
      {syncSummary && <Text>{summaryText(syncSummary)}</Text>}
      <FlatList
        data={activities}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View>
            <TouchableOpacity onPress={() => navigation.navigate('ActivitySummary', { activityId: item.id })}>
              <Text>{item.title}</Text>
            </TouchableOpacity>
            <Text>
              {item.syncStatus === 'conflict' ? 'Conflict' : item.syncStatus === 'pending' ? 'Not synced' : 'Synced'}
            </Text>
            {item.syncStatus === 'conflict' && (
              <Button title="Resolve" onPress={() => navigation.navigate('ConflictResolution', { activityId: item.id })} />
            )}
          </View>
        )}
      />
    </View>
  );
}
