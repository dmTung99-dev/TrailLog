import React, { useEffect, useState } from 'react';
import { Button, FlatList, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Activity, createActivitiesRepository } from '../db/activitiesRepository';
import { createSqliteStorageAdapter } from '../db/sqliteStorageAdapter';
import { createSyncEngine, SyncSummary } from '../sync/syncEngine';
import { apiClient } from '../store/authStore';

export function HistoryScreen() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [syncSummary, setSyncSummary] = useState<SyncSummary | null>(null);
  const navigation = useNavigation<any>();

  useEffect(() => {
    (async () => {
      const db = await createSqliteStorageAdapter();
      const repo = createActivitiesRepository(db);
      setActivities(await repo.listActivities());
    })();
  }, []);

  const onSyncPress = async () => {
    const db = await createSqliteStorageAdapter();
    const repo = createActivitiesRepository(db);
    const engine = createSyncEngine(repo, apiClient);
    const summary = await engine.syncNow();
    setSyncSummary(summary);
  };

  const summaryText = (summary: SyncSummary) =>
    `Synced ${summary.synced}, ${summary.conflicts} conflict${summary.conflicts === 1 ? '' : 's'}`;

  return (
    <View>
      <Button title="Sync now" onPress={onSyncPress} />
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
