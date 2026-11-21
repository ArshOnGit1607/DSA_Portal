import type { AuditRepository, AuditEntry } from '@dsa-portal/core';
import { pool } from '../pool';
import type { PoolClient } from 'pg';

interface AuditRow {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_value: any;
  new_value: any;
  ip_address: string | null;
  created_at: Date;
}

export class PostgresAuditRepository implements AuditRepository {
  constructor(private client?: PoolClient) {}

  private get executor() {
    return this.client || pool;
  }

  async log(entry: Omit<AuditEntry, 'id' | 'createdAt'>): Promise<void> {
    const sql = `
      INSERT INTO audit_log (actor_id, action, entity_type, entity_id, old_value, new_value, ip_address)
      VALUES ($1::uuid, $2, $3, $4::uuid, $5, $6, $7::inet);
    `;
    await this.executor.query(sql, [
      entry.actorId || null,
      entry.action,
      entry.entityType,
      entry.entityId || null,
      entry.oldValue ? JSON.stringify(entry.oldValue) : null,
      entry.newValue ? JSON.stringify(entry.newValue) : null,
      entry.ipAddress || null,
    ]);
  }

  async findByEntity(entityType: string, entityId: string): Promise<AuditEntry[]> {
    const sql = `
      SELECT * FROM audit_log
      WHERE entity_type = $1 AND entity_id = $2::uuid
      ORDER BY created_at DESC;
    `;
    const res = await this.executor.query<AuditRow>(sql, [entityType, entityId]);
    return res.rows.map((r) => this.mapRow(r));
  }

  async findByActor(actorId: string): Promise<AuditEntry[]> {
    const sql = `
      SELECT * FROM audit_log
      WHERE actor_id = $1::uuid
      ORDER BY created_at DESC;
    `;
    const res = await this.executor.query<AuditRow>(sql, [actorId]);
    return res.rows.map((r) => this.mapRow(r));
  }

  private mapRow(row: AuditRow): AuditEntry {
    return {
      id: Number(row.id),
      actorId: row.actor_id || undefined,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id || undefined,
      oldValue: row.old_value,
      newValue: row.new_value,
      ipAddress: row.ip_address || undefined,
      createdAt: row.created_at,
    };
  }
}
