import { config } from 'dotenv';
process.env.NODE_ENV = 'test';
config({ path: '.env.test', override: true });
if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test')) throw new Error('Refusing integration tests outside _test database');
