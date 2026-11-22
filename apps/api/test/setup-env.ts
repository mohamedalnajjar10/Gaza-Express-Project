import { config } from 'dotenv';
process.env.NODE_ENV = 'test';
config({ path: '.env.test', override: false });
const target = new URL(process.env.DATABASE_URL ?? 'mysql://invalid');
const host = target.hostname;
const local = ['localhost', '127.0.0.1', '[::1]'].includes(host);
const isolated = process.env.E2E_DATABASE_HOST === host && /^[-a-z0-9]+$/i.test(host);
if (target.protocol !== 'mysql:' || !target.pathname.endsWith('_test') ||
    (!local && !isolated) || !target.username || target.username.toLowerCase() === 'root' ||
    process.env.E2E_ALLOW_DATABASE !== '1') {
  throw new Error('E2E requires explicit opt-in and a dedicated non-root MySQL test database on an approved test host');
}
