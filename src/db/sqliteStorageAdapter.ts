import SQLite from 'react-native-sqlite-storage';
import { SqlDatabase } from './sqlDatabase';

SQLite.enablePromise(true);

export async function createSqliteStorageAdapter(): Promise<SqlDatabase> {
  const db = await SQLite.openDatabase({ name: 'traillog.db', location: 'default' });
  return {
    async executeSql(sql: string, params: unknown[] = []) {
      const [result] = await db.executeSql(sql, params);
      const rows: any[] = [];
      for (let i = 0; i < result.rows.length; i += 1) {
        rows.push(result.rows.item(i));
      }
      return { rows };
    },
  };
}
