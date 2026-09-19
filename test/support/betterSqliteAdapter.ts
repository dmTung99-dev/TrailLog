import Database from 'better-sqlite3';
import { SqlDatabase } from '../../src/db/sqlDatabase';

export function createBetterSqliteAdapter(): SqlDatabase {
  const db = new Database(':memory:');
  return {
    async executeSql(sql: string, params: unknown[] = []) {
      const trimmed = sql.trim().toUpperCase();
      if (trimmed.startsWith('SELECT')) {
        const rows = db.prepare(sql).all(...params);
        return { rows };
      }
      db.prepare(sql).run(...params);
      return { rows: [] };
    },
  };
}
