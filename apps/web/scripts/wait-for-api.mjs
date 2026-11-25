import { setTimeout as delay } from 'node:timers/promises';

const endpoint = 'http://127.0.0.1:5050/api/v1/ready';
const deadline = Date.now() + 60_000;
console.log(`Waiting for the local API at ${endpoint}`);
while (true) {
  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(1500) });
    if (response.ok && (await response.json()).data?.status === 'ready') break;
  } catch {
    // Nest may still be compiling or connecting to its dependencies.
  }
  if (Date.now() >= deadline) {
    throw new Error('API unavailable. Start MySQL and Redis, then run npm run start:dev in apps/api.');
  }
  await delay(1000);
}
