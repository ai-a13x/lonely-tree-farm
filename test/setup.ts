import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeEach } from 'vitest';

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

beforeEach(async () => {
  await env.DB.batch([env.DB.prepare('DELETE FROM reservations'), env.DB.prepare('DELETE FROM listings')]);
});
