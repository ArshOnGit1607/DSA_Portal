import type { AuditRepository, AuditEntry } from '../types';
import type { DatabaseAdapter } from '../adapter';

interface AuditRow {
  id: number;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_value: string | null;
  new_value: string | null;
  ip_address: string | null;
  created_at: string;
}

export class SqliteAuditRepository implements AuditRepository {
  constructor(private adapter: DatabaseAdapter) {}

  async log(entry: Omit<AuditEntry, 'id' | 'createdAt'>): Promise<void> {
    await this.adapter.execute(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, old_value, new_value, ip_address, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        entry.actorId || null,
        entry.action,
        entry.entityType,
        entry.entityId || null,
        entry.oldValue ? JSON.stringify(entry.oldValue) : null,
        entry.newValue ? JSON.stringify(entry.newValue) : null,
        entry.ipAddress || null,
      ]
    );
  }

  async findByEntity(entityType: string, entityId: string): Promise<AuditEntry[]> {
    const rows = await this.adapter.query<AuditRow>(
      `SELECT * FROM audit_log
       WHERE entity_type = ? AND entity_id = ?
       ORDER BY created_at DESC`,
      [entityType, entityId]
    );

    return rows.map((r) => this.mapRow(r));
  }

  async findByActor(actorId: string): Promise<AuditEntry[]> {
    const rows = await this.adapter.query<AuditRow>(
      `SELECT * FROM audit_log
       WHERE actor_id = ?
       ORDER BY created_at DESC`,
      [actorId]
    );

    return rows.map((r) => this.mapRow(r));
  }

  private mapRow(row: AuditRow): AuditEntry {
    return {
      id: row.id,
      actorId: row.actor_id || undefined,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id || undefined,
      oldValue: row.old_value ? JSON.parse(row.old_value) : undefined,
      newValue: row.new_value ? JSON.parse(row.new_value) : undefined,
      ipAddress: row.ip_address || undefined,
      createdAt: new Date(row.created_at),
    };
  }
}
