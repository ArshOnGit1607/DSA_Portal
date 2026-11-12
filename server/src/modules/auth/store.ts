import { randomUUID } from 'crypto';
import type { User } from '@dsa-portal/core';
import { pool } from '../../db/pool';

export type ApiUser = User & { createdAt: Date };

/**
 * What the auth routes need from storage. Core's UserRepository has no email lookup,
 * password hash or sessions, so auth owns this small interface (see CR-009).
 */
export interface AuthStore {
  /** Throws `DuplicateUserError` if username or email is taken. */
  createUser(u: { username: string; email: string; passwordHash: string }): Promise<ApiUser>;
  findByEmail(email: string): Promise<(ApiUser & { passwordHash: string }) | null>;
  findById(id: string): Promise<ApiUser | null>;
  /** Refresh-token sessions keyed by sha256(token), never the raw token. */
  createSession(s: { userId: string; tokenHash: string; expiresAt: Date; ip?: string; userAgent?: string }): Promise<void>;
  findSession(tokenHash: string): Promise<{ userId: string; expiresAt: Date } | null>;
  deleteSession(tokenHash: string): Promise<void>;
}

export class DuplicateUserError extends Error {}

/** For tests and running the API without a database. */
export class InMemoryAuthStore implements AuthStore {
  private users = new Map<string, ApiUser & { passwordHash: string }>();
  private sessions = new Map<string, { userId: string; expiresAt: Date }>();

  async createUser(u: { username: string; email: string; passwordHash: string }) {
    for (const x of this.users.values()) {
      if (x.username === u.username || x.email === u.email) throw new DuplicateUserError();
    }
    const user = { id: randomUUID(), role: 'user' as const, createdAt: new Date(), ...u };
    this.users.set(user.id, user);
    return strip(user);
  }
  async findByEmail(email: string) {
    return [...this.users.values()].find((u) => u.email === email) ?? null;
  }
  async findById(id: string) {
    const u = this.users.get(id);
    return u ? strip(u) : null;
  }
  async createSession(s: { userId: string; tokenHash: string; expiresAt: Date }) {
    this.sessions.set(s.tokenHash, { userId: s.userId, expiresAt: s.expiresAt });
  }
  async findSession(tokenHash: string) {
    return this.sessions.get(tokenHash) ?? null;
  }
  async deleteSession(tokenHash: string) {
    this.sessions.delete(tokenHash);
  }
}

const strip = ({ passwordHash: _, ...u }: ApiUser & { passwordHash: string }): ApiUser => u;

const USER_COLS = 'id, username, email, role, created_at AS "createdAt"';

/** Uses Person 2's `users` and `sessions` tables (001_initial_schema). */
export class PostgresAuthStore implements AuthStore {
  async createUser(u: { username: string; email: string; passwordHash: string }) {
    try {
      const res = await pool.query<ApiUser>(
        `INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING ${USER_COLS}`,
        [u.username, u.email, u.passwordHash]
      );
      return res.rows[0];
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw new DuplicateUserError(); // unique_violation
      throw err;
    }
  }
  async findByEmail(email: string) {
    const res = await pool.query<ApiUser & { passwordHash: string }>(
      `SELECT ${USER_COLS}, password_hash AS "passwordHash" FROM users WHERE email = $1`,
      [email]
    );
    return res.rows[0] ?? null;
  }
  async findById(id: string) {
    const res = await pool.query<ApiUser>(`SELECT ${USER_COLS} FROM users WHERE id = $1::uuid`, [id]);
    return res.rows[0] ?? null;
  }
  async createSession(s: { userId: string; tokenHash: string; expiresAt: Date; ip?: string; userAgent?: string }) {
    await pool.query(
      'INSERT INTO sessions (user_id, token_hash, expires_at, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5)',
      [s.userId, s.tokenHash, s.expiresAt, s.ip ?? null, s.userAgent ?? null]
    );
  }
  async findSession(tokenHash: string) {
    const res = await pool.query<{ userId: string; expiresAt: Date }>(
      'SELECT user_id AS "userId", expires_at AS "expiresAt" FROM sessions WHERE token_hash = $1',
      [tokenHash]
    );
    return res.rows[0] ?? null;
  }
  async deleteSession(tokenHash: string) {
    await pool.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
  }
}
