import { SqlDatabase } from './sqlDatabase';

export async function initSchema(db: SqlDatabase): Promise<void> {
  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      notes TEXT,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      updated_at TEXT NOT NULL
    )
  `);
  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS route_points (
      id TEXT PRIMARY KEY,
      activity_id TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      recorded_at TEXT NOT NULL,
      sequence INTEGER NOT NULL
    )
  `);
  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS checkpoints (
      id TEXT PRIMARY KEY,
      activity_id TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      captured_at TEXT NOT NULL,
      photo_path TEXT
    )
  `);
}
