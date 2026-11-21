import type { User, UserRepository } from '../../types';
import type { DatabaseAdapter } from '../adapter';

interface UserRow {
  id: string;
  username: string;
  email: string;
  role: string;
  created_at: string;
}

export class SqliteUserRepository implements UserRepository {
  constructor(private adapter: DatabaseAdapter) {}

  async findById(id: string): Promise<User | null> {
    const row = await this.adapter.queryOne<UserRow>(
      'SELECT id, username, email, role FROM users WHERE id = ? LIMIT 1',
      [id]
    );
    if (!row) return null;
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      role: row.role as 'user' | 'admin',
    };
  }

  async findByUsername(username: string): Promise<User | null> {
    const row = await this.adapter.queryOne<UserRow>(
      'SELECT id, username, email, role FROM users WHERE username = ? LIMIT 1',
      [username]
    );
    if (!row) return null;
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      role: row.role as 'user' | 'admin',
    };
  }

  async save(user: User & { passwordHash?: string }): Promise<void> {
    const userId = user.id || `user-${Date.now()}`;
    const passwordHash = user.passwordHash || 'default-hash';

    const existing = await this.adapter.queryOne<{ id: string }>(
      'SELECT id FROM users WHERE id = ? OR username = ? LIMIT 1',
      [userId, user.username]
    );

    if (existing) {
      await this.adapter.execute(
        `UPDATE users SET
          username = ?, email = ?, role = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [user.username, user.email, user.role, existing.id]
      );
    } else {
      await this.adapter.execute(
        `INSERT INTO users (id, username, email, password_hash, role)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, user.username, user.email, passwordHash, user.role]
      );
    }
  }
}
