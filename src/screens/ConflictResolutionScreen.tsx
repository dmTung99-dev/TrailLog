import React, { useEffect, useState } from 'react';
import { Button, Text, View } from 'react-native';
import { Activity, createActivitiesRepository } from '../db/activitiesRepository';
import { createSqliteStorageAdapter } from '../db/sqliteStorageAdapter';

interface Props {
  route: { params: { activityId: string } };
}

export function ConflictResolutionScreen({ route }: Props) {
  const [activity, setActivity] = useState<Activity | null>(null);

  useEffect(() => {
    (async () => {
      const db = await createSqliteStorageAdapter();
      const repo = createActivitiesRepository(db);
      const found = await repo.getActivity(route.params.activityId);
      setActivity(found);
    })();
  }, [route.params.activityId]);

  if (!activity || !activity.conflictServerActivity) return null;

  const serverActivity = JSON.parse(activity.conflictServerActivity);

  const keepMine = async () => {
    const db = await createSqliteStorageAdapter();
    const repo = createActivitiesRepository(db);
    // Deliberately does NOT call markActivitySynced or the API client
    // directly — that would duplicate SyncEngine's already-hardened
    // conflict-push logic. Re-applying the activity's own current title
    // touches updated_at (to now, newer than the server's stored
    // updatedAt from the conflict) and resets sync_status to 'pending',
    // so the next real syncNow() pass pushes this activity's title
    // through the normal, well-tested path instead of just recording a
    // local-only "resolved" flag that the server never sees.
    await repo.updateActivityMetadata(activity.id, { title: activity.title });
  };

  const takeServerVersion = async () => {
    const db = await createSqliteStorageAdapter();
    const repo = createActivitiesRepository(db);
    await repo.updateActivityMetadata(activity.id, { title: serverActivity.title });
  };

  return (
    <View>
      <Text>Your version</Text>
      <Text>{activity.title}</Text>
      <Text>Server version</Text>
      <Text>{serverActivity.title}</Text>
      <Button title="Keep mine" onPress={keepMine} />
      <Button title="Take server version" onPress={takeServerVersion} />
    </View>
  );
}
