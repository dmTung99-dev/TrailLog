import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Activity, createActivitiesRepository } from '../db/activitiesRepository';
import { createSqliteStorageAdapter } from '../db/sqliteStorageAdapter';

interface Props {
  route: { params: { activityId: string } };
}

export function ActivitySummaryScreen({ route }: Props) {
  const [activity, setActivity] = useState<Activity | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const db = await createSqliteStorageAdapter();
        const repo = createActivitiesRepository(db);
        setActivity(await repo.getActivity(route.params.activityId));
      } finally {
        setLoading(false);
      }
    })();
  }, [route.params.activityId]);

  if (loading) {
    return (
      <View>
        <Text>Loading...</Text>
      </View>
    );
  }

  if (!activity) {
    return (
      <View>
        <Text>Activity not found</Text>
      </View>
    );
  }

  return (
    <View>
      <Text>{activity.title}</Text>
      <Text>{activity.routePoints.length} route points</Text>
      <Text>{activity.checkpoints.length} checkpoint{activity.checkpoints.length === 1 ? '' : 's'}</Text>
    </View>
  );
}
