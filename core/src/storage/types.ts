import type {
  ProblemRepository,
  SubmissionRepository,
  UserRepository,
  StatsRepository,
} from '../types';

export interface AuditEntry {
  id?: number | string;
  actorId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string;
  createdAt?: Date;
}

export interface AuditRepository {
  log(entry: Omit<AuditEntry, 'id' | 'createdAt'>): Promise<void>;
  findByEntity(entityType: string, entityId: string): Promise<AuditEntry[]>;
  findByActor(actorId: string): Promise<AuditEntry[]>;
}

export interface RepositoryBundle {
  problems: ProblemRepository;
  submissions: SubmissionRepository;
  users: UserRepository;
  stats: StatsRepository;
  audit: AuditRepository;
  unitOfWork<T>(cb: (bundle: RepositoryBundle) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export type RepositoryConfig =
  | {
      type: 'postgres';
      connectionString?: string;
      maxPoolSize?: number;
    }
  | {
      type: 'sqlite';
      filename?: string; // ':memory:' or file path
      wal?: boolean;
    };
