/**
 * DatabaseAdapter: Abstraction over relational database drivers.
 * Decouples repository logic from specific database drivers (e.g., better-sqlite3
 * for Node/CLI, expo-sqlite for React Native, or in-memory drivers for tests).
 */
export interface DatabaseAdapter {
  /**
   * Execute an arbitrary DDL or DML statement without returning rows
   */
  execute(sql: string, params?: unknown[]): Promise<void>;

  /**
   * Execute a query and return all matching rows
   */
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;

  /**
   * Execute a query and return the first matching row or null
   */
  queryOne<T = unknown>(sql: string, params?: unknown[]): Promise<T | null>;

  /**
   * Execute a sequence of operations within a transactional block
   */
  transaction<T>(cb: (adapter: DatabaseAdapter) => Promise<T>): Promise<T>;

  /**
   * Close the database connection
   */
  close(): Promise<void>;
}
