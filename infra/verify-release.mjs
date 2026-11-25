import assert from 'node:assert/strict';

assert(process.argv[2], 'Usage: node infra/verify-release.mjs https://your-staging-host');
const target = new URL(process.argv[2]);
assert.equal(target.protocol, 'https:', 'Use the HTTPS origin of the release environment');
assert.equal(target.href, `${target.origin}/`, 'Supply the site origin without credentials, path, query or fragment');

async function get(path) {
  const response = await fetch(new URL(path, target), {
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(response.status, 200, `${path} returned HTTP ${response.status}`);
  return response;
}

const html = await get('/login');
assert.match(html.headers.get('content-type') ?? '', /^text\/html\b/i);
const page = await html.text();
const entry = page.match(/<script\b[^>]*\bsrc="(\/assets\/[^"?#]+\.js)"/i)?.[1];
assert(entry, 'The login HTML does not reference a built JavaScript entry');
const script = await get(entry);
assert.match(script.headers.get('content-type') ?? '', /javascript/i);
await script.body?.cancel();
console.log('HTTPS login shell and JavaScript entry reachable');

for (const route of ['health', 'routing-ready', 'ready']) {
  const path = `/api/v1/${route}`;
  const body = await (await get(path)).json();
  const expected = route === 'health' ? 'ok' : 'ready';
  assert.equal(body.success, true, `${path} did not return a success envelope`);
  assert.equal(body.data?.status, expected, `${path} is not reporting ${expected}`);
  if (route === 'health') assert.equal(body.data.environment, 'production');
  console.log(`${path} reports ${expected}`);
}
