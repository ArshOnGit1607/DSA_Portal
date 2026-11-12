import type { User, UserRepository } from '@dsa-portal/core';
import { pool } from '../pool';

interface UserRow {
  id: string;
  username: string;
  email: string;
  role: 'user' | 'admin';
  created_at: Date;
}

export class PostgresUserRepository implements UserRepository {
  async findById(id: string): Promise<User | null> {
    const res = await pool.query<UserRow>(
      'SELECT id, username, email, role FROM users WHERE id = $1::uuid LIMIT 1',
      [id]
    );
    if (res.rows.length === 0) return null;
    return res.rows[0];
  }

  async findByUsername(username: string): Promise<User | null> {
    const res = await pool.query<UserRow>(
      'SELECT id, username, email, role FROM users WHERE username = $1 LIMIT 1',
      [username]
    );
    if (res.rows.length === 0) return null;
    return res.rows[0];
  }

  async save(user: User & { passwordHash?: string }): Promise<void> {
    const defaultHash = user.passwordHash || '$2b$10$placeholderForOAuthOrDevTestingOnlyXXXXX';
    const sql = `
      INSERT INTO users (id, username, email, password_hash, role)
      VALUES (
        COALESCE($1::uuid, gen_random_uuid()),
        $2,
        $3,
        $4,
        $5
      )
      ON CONFLICT (id) DO UPDATE SET
        username = EXCLUDED.username,
        email = EXCLUDED.email,
        role = EXCLUDED.role,
        updated_at = now();
    `;

    await pool.query(sql, [
      user.id || null,
      user.username,
      user.email,
      defaultHash,
      user.role || 'user',
    ]);
  }
}
