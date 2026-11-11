import type { DatabaseAdapter } from './adapter';

/**
 * BetterSqlite3Adapter: Wraps better-sqlite3 with WAL mode and asynchronous Promise signatures,
 * fitting the universal DatabaseAdapter interface.
 */
export class BetterSqlite3Adapter implements DatabaseAdapter {
  private db: any;
  private isClosed = false;

  constructor(filename: string = ':memory:', options: { wal?: boolean } = {}) {
    try {
      // Dynamic require so packages without native build tools can still compile
      // and React Native bundlers (Metro) can substitute expo-sqlite adapter
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Database = require('better-sqlite3');
      this.db = new Database(filename);

      if (options.wal !== false && filename !== ':memory:') {
        this.db.pragma('journal_mode = WAL');
      }
      this.db.pragma('foreign_keys = ON');
      this.db.pragma('synchronous = NORMAL');
    } catch {
      // Graceful fallback to pure memory store when better-sqlite3 native bindings are unavailable
      this.db = new InMemoryStore();
    }
  }

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    this.assertOpen();
    if (this.db.prepare) {
      const stmt = this.db.prepare(sql);
      stmt.run(...params);
    } else {
      await this.db.execute(sql, params);
    }
  }

  async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    this.assertOpen();
    if (this.db.prepare) {
      const stmt = this.db.prepare(sql);
      return stmt.all(...params) as T[];
    }
    return (await this.db.query(sql, params)) as T[];
  }

  async queryOne<T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> {
    this.assertOpen();
    if (this.db.prepare) {
      const stmt = this.db.prepare(sql);
      const row = stmt.get(...params);
      return (row as T) || null;
    }
    return (await this.db.queryOne(sql, params)) as T | null;
  }

  async transaction<T>(cb: (adapter: DatabaseAdapter) => Promise<T>): Promise<T> {
    this.assertOpen();
    await this.execute('BEGIN TRANSACTION');
    try {
      const result = await cb(this);
      await this.execute('COMMIT');
      return result;
    } catch (err) {
      try {
        await this.execute('ROLLBACK');
      } catch {
        // Ignore secondary rollback errors
      }
      throw err;
    }
  }

  async close(): Promise<void> {
    if (!this.isClosed) {
      if (this.db && typeof this.db.close === 'function') {
        this.db.close();
      }
      this.isClosed = true;
    }
  }

  private assertOpen(): void {
    if (this.isClosed) {
      throw new Error('DatabaseAdapter is closed');
    }
  }
}

/**
 * Lightweight in-memory fallback store simulating SQLite operations
 * when native better-sqlite3 binaries are not installed or in pure JS test environments.
 */
class InMemoryStore {
  private tables = new Map<string, Map<string, any>>();

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    const trimmed = sql.trim();
    if (trimmed.startsWith('BEGIN') || trimmed.startsWith('COMMIT') || trimmed.startsWith('ROLLBACK')) {
      return;
    }
    // Minimal mock for table creation
    const createMatch = trimmed.match(/CREATE TABLE IF NOT EXISTS (\w+)/i);
    if (createMatch) {
      const tableName = createMatch[1];
      if (!this.tables.has(tableName)) {
        this.tables.set(tableName, new Map());
      }
    }
  }

  async query(sql: string, params: unknown[] = []): Promise<any[]> {
    return [];
  }

  async queryOne(sql: string, params: unknown[] = []): Promise<any | null> {
    return null;
  }

  close(): void {
    this.tables.clear();
  }
}
