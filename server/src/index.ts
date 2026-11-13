import { buildApp } from './app';
import { closePool } from './db/pool';
import { PostgresProblemRepository, PostgresSubmissionRepository } from './db/repositories';
import { PostgresAuthStore } from './modules/auth/store';
import { PostgresSubmissionQueue } from './modules/submissions/queue';
import { PostgresStatsStore } from './modules/stats/stats.service';
import { cacheFromEnv } from './cache/cache';
import { PostgresLeaderboard } from './modules/leaderboard/routes';
import { PostgresDailyStore } from './modules/daily/routes';

const cache = cacheFromEnv(); // REDIS_URL unset = no cache

const app = buildApp({
  problems: new PostgresProblemRepository(),
  submissions: new PostgresSubmissionRepository(),
  queue: new PostgresSubmissionQueue(),
  auth: new PostgresAuthStore(),
  stats: new PostgresStatsStore(),
  cache,
  leaderboard: new PostgresLeaderboard(),
  daily: new PostgresDailyStore(),
});
app.addHook('onClose', closePool);
app.addHook('onClose', () => cache.close());

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
