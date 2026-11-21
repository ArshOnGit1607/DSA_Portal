import { seedDatabase } from '../server/src/db/seed';

seedDatabase()
  .then(() => {
    console.log('[Scripts] Seed finished successfully.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[Scripts] Seed error:', err);
    process.exit(1);
  });
