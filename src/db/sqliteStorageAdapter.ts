import SQLite from 'react-native-sqlite-storage';
import { SqlDatabase } from './sqlDatabase';
import { initSchema } from './schema';

SQLite.enablePromise(true);

export async function createSqliteStorageAdapter(): Promise<SqlDatabase> {
  const db = await SQLite.openDatabase({ name: 'traillog.db', location: 'default' });
  const adapter: SqlDatabase = {
    async executeSql(sql: string, params: unknown[] = []) {
      const [result] = await db.executeSql(sql, params);
      const rows: any[] = [];
      for (let i = 0; i < result.rows.length; i += 1) {
        rows.push(result.rows.item(i));
      }
      return { rows };
    },
  };
  // Every caller of this function (the store, and the History/Summary
  // screens, which each open their own connection) must get a
  // correctly-initialized schema. initSchema is CREATE TABLE IF NOT
  // EXISTS-based, so running it on every connection open is idempotent
  // and cheap.
  await initSchema(adapter);
  return adapter;
}
