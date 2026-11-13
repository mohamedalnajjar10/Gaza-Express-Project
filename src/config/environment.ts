export function validateEnvironment(env: Record<string, unknown>) {
  for (const key of ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET', 'REDIS_URL']) {
    if (typeof env[key] !== 'string' || !env[key]) throw new Error(`Missing configuration: ${key}`);
  }
  const db = new URL(String(env.DATABASE_URL));
  if (env.NODE_ENV === 'test' && !db.pathname.endsWith('_test')) throw new Error('Tests require a dedicated _test database');
  if (env.LOAD_TEST_MODE === '1' && (env.NODE_ENV !== 'test' || db.pathname !== '/wasla_load_test')) {
    throw new Error('LOAD_TEST_MODE requires the dedicated wasla_load_test database');
  }
  const smsMode = env.SMS_PROVIDER || 'disabled';
  if (!['disabled', 'fake', 'twilio'].includes(String(smsMode))) throw new Error('Invalid SMS_PROVIDER');
  if (smsMode !== 'disabled' && !/^[a-f0-9]{64}$/i.test(String(env.SMS_OUTBOX_KEY))) throw new Error('Valid SMS_OUTBOX_KEY required');
  if (smsMode === 'twilio') {
    if (!/^AC[a-f0-9]{32}$/i.test(String(env.TWILIO_ACCOUNT_SID)) || !/^MG[a-f0-9]{32}$/i.test(String(env.TWILIO_MESSAGING_SERVICE_SID)) || !env.TWILIO_AUTH_TOKEN) {
      throw new Error('Twilio credentials and Messaging Service are required');
    }
  }
  if (env.GOOGLE_AUTH_ENABLED === 'true') {
    for (const key of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_CALLBACK_URL', 'FRONTEND_URL']) {
      if (typeof env[key] !== 'string' || !env[key] || env[key].includes('REPLACE')) throw new Error(`Missing Google configuration: ${key}`);
    }
    for (const key of ['GOOGLE_CALLBACK_URL', 'FRONTEND_URL']) {
      const url = new URL(String(env[key]));
      if (env.NODE_ENV === 'production' && url.protocol !== 'https:') throw new Error(`HTTPS required: ${key}`);
    }
  }
  if (env.NODE_ENV === 'production') {
    if (smsMode === 'fake') throw new Error('Fake SMS is limited to development and test');
    if (typeof env.DELIVERY_CODE_SECRET !== 'string' || env.DELIVERY_CODE_SECRET.length < 64 || env.DELIVERY_CODE_SECRET.startsWith('REPLACE_')) throw new Error('Strong DELIVERY_CODE_SECRET required');
    if (db.username === 'root') throw new Error('Production must not use the root account');
    if (String(env.JWT_SECRET).length < 64 || String(env.JWT_REFRESH_SECRET).length < 64 || env.JWT_SECRET === env.JWT_REFRESH_SECRET) throw new Error('Independent strong signing secrets required');
  }
  return env;
}
