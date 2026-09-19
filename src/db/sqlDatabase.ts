export interface SqlDatabase {
  executeSql(sql: string, params?: unknown[]): Promise<{ rows: any[] }>;
}
