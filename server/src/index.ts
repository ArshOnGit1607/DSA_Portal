import { buildApp } from './app';
import { closePool } from './db/pool';
import { PostgresProblemRepository, PostgresSubmissionRepository } from './db/repositories';
import { PostgresAuthStore } from './modules/auth/store';
import { PostgresSubmissionQueue } from './modules/submissions/queue';

const app = buildApp({
  problems: new PostgresProblemRepository(),
  submissions: new PostgresSubmissionRepository(),
  queue: new PostgresSubmissionQueue(),
  users: new PostgresAuthStore(),
});
app.addHook('onClose', closePool);

const port = Number(process.env.PORT || 3000);
const host = '0.0.0.0';

app.listen({ port, host }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`Server listening at ${address}`);
});

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => void app.close().then(() => process.exit(0)));
}
