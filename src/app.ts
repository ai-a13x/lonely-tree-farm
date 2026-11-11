import { handleAdmin } from './admin';
import { cloudflareKeys, hasValidAccessToken, type KeySource } from './access';
import type { Env } from './env';
import { json } from './http';
import { listActive, reserve } from './public';

/** `keys` is injectable so tests can verify tokens against a local key. */
export function createApp(keys: KeySource = cloudflareKeys): ExportedHandler<Env> {
  return {
    async fetch(req, env, ctx) {
      const { pathname } = new URL(req.url);
      try {
        if (pathname === '/api/admin' || pathname.startsWith('/api/admin/')) {
          if (!(await hasValidAccessToken(req, env, keys))) return json({ error: 'Forbidden' }, 403);
          return await handleAdmin(req, env);
        }
        if (pathname === '/api/listings' && req.method === 'GET') return await listActive(env);
        if (pathname === '/api/reserve' && req.method === 'POST') return await reserve(req, env, ctx);
        if (pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404);
        return await env.ASSETS.fetch(req);
      } catch (err) {
        console.error('Unhandled error', String(err));
        return json({ error: 'Something went wrong' }, 500);
      }
    },
  };
}
