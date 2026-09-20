// src/db/sqliteStorageAdapter.test.ts
//
// The real `react-native-sqlite-storage` module can't run under plain Jest
// (it's a native binding), so this test fakes the module's `openDatabase`
// connection and asserts that `createSqliteStorageAdapter()` runs the
// schema-creation statements against it before resolving. This is the
// regression test for the bug where the real app opened a SQLite connection
// but never called `initSchema()`, so the first `startActivity()` on a real
// device would fail with "no such table: activities".

jest.mock('react-native-sqlite-storage', () => {
  const mockExecuteSql = jest.fn().mockImplementation(() =>
    Promise.resolve([{ rows: { length: 0, item: () => undefined } }]),
  );
  const mockOpenDatabase = jest.fn().mockResolvedValue({ executeSql: mockExecuteSql });
  return {
    __esModule: true,
    default: {
      enablePromise: jest.fn(),
      openDatabase: mockOpenDatabase,
    },
    __mockExecuteSql: mockExecuteSql,
    __mockOpenDatabase: mockOpenDatabase,
  };
});

import { createSqliteStorageAdapter } from './sqliteStorageAdapter';

const { __mockExecuteSql: mockExecuteSql, __mockOpenDatabase: mockOpenDatabase } = jest.requireMock(
  'react-native-sqlite-storage',
) as { __mockExecuteSql: jest.Mock; __mockOpenDatabase: jest.Mock };

describe('createSqliteStorageAdapter', () => {
  beforeEach(() => {
    mockExecuteSql.mockClear();
    mockOpenDatabase.mockClear();
  });

  it('creates the activities, route_points, and checkpoints tables before returning the adapter', async () => {
    await createSqliteStorageAdapter();

    expect(mockOpenDatabase).toHaveBeenCalledWith({ name: 'traillog.db', location: 'default' });

    const executedStatements = mockExecuteSql.mock.calls.map(([sql]) => String(sql));
    expect(executedStatements.some((sql) => /CREATE TABLE IF NOT EXISTS activities/.test(sql))).toBe(true);
    expect(executedStatements.some((sql) => /CREATE TABLE IF NOT EXISTS route_points/.test(sql))).toBe(true);
    expect(executedStatements.some((sql) => /CREATE TABLE IF NOT EXISTS checkpoints/.test(sql))).toBe(true);
  });

  it('returns an adapter that can run further queries against the same, already-initialized connection', async () => {
    const adapter = await createSqliteStorageAdapter();
    mockExecuteSql.mockClear();
    mockExecuteSql.mockResolvedValueOnce([{ rows: { length: 0, item: () => undefined } }]);

    const result = await adapter.executeSql('SELECT * FROM activities WHERE id = ?', ['abc']);

    expect(result.rows).toEqual([]);
    expect(mockExecuteSql).toHaveBeenCalledWith('SELECT * FROM activities WHERE id = ?', ['abc']);
  });

  it('initializes the schema exactly once per opened connection', async () => {
    await createSqliteStorageAdapter();

    expect(mockOpenDatabase).toHaveBeenCalledTimes(1);
    const createTableCalls = mockExecuteSql.mock.calls.filter(([sql]) => /CREATE TABLE/.test(String(sql)));
    expect(createTableCalls).toHaveLength(3);
  });
});
