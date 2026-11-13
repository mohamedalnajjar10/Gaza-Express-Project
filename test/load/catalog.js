import http from 'k6/http';
import exec from 'k6/execution';
import { check, fail, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const base = 'http://gateway/api/v1';
const mode = __ENV.MODE || 'quick';
const scenarios = {
  browse: { executor: 'ramping-vus', exec: 'browse', startVUs: 0, stages: mode === 'soak'
    ? [{ duration: '1m', target: 20 }, { duration: __ENV.SOAK_DURATION || '30m', target: 20 }, { duration: '30s', target: 0 }]
    : [{ duration: '5s', target: 8 }, { duration: '10s', target: 12 }, { duration: '2s', target: 32 }, { duration: '8s', target: 32 }, { duration: '5s', target: 0 }], gracefulRampDown: '3s' },
  login: { executor: 'constant-vus', exec: 'loginFlow', vus: 1, duration: mode === 'soak' ? (__ENV.SOAK_DURATION || '30m') : '30s' },
  orders: { executor: 'constant-vus', exec: 'orderFlow', vus: 3, duration: mode === 'soak' ? (__ENV.SOAK_DURATION || '30m') : '30s' },
};
const throttled = new Rate('http_throttled');
export const options = {
  scenarios, discardResponseBodies: true,
  thresholds: { http_req_failed: ['rate<0.01'], http_throttled: ['rate==0'], checks: ['rate>0.99'],
    'http_req_duration{flow:catalog}': ['p(95)<500'], 'http_req_duration{flow:login}': ['p(95)<1500'],
    'http_req_duration{flow:order}': ['p(95)<1000'] },
};

function call(method, path, status, flow, body, token, moreHeaders) {
  const response = http.request(method, `${base}${path}`, body === undefined ? null : JSON.stringify(body), {
    responseType: flow === 'catalog' ? 'none' : 'text',
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...moreHeaders },
    tags: { flow, name: `${method} ${path.split('?')[0].replace(/\/\d+(?=\/|$)/g, '/:id')}` },
  });
  throttled.add(response.status === 429);
  if (!check(response, { 'expected HTTP status': result => result.status === status })) fail(`${flow}: ${method} ${path} returned ${response.status}`);
  return flow === 'catalog' ? undefined : response.json('data');
}

function login(user) {
  const phone = `059${String(user).padStart(7, '0')}`;
  return call('POST', '/auth/login', 200, 'login', { phone, password: __ENV.LOAD_PASSWORD }).tokens.access_token;
}

export function setup() {
  const health = http.get(`${base}/health`, { responseType: 'text' });
  if (health.status !== 200 || health.json('data.environment') !== 'test') throw new Error('Load run requires an isolated test API');
  if (!__ENV.LOAD_PASSWORD || !Number(__ENV.STORE_ID) || !Number(__ENV.PRODUCT_ID)) throw new Error('Load fixtures must be seeded first');
}

export function browse() {
  call('GET', '/stores?limit=20', 200, 'catalog');
  call('GET', '/stores/top-rated', 200, 'catalog');
  call('GET', '/store-categories', 200, 'catalog');
  call('GET', `/stores/${__ENV.STORE_ID}`, 200, 'catalog');
  sleep(0.3 + Math.random() * 0.4);
}

export function loginFlow() { login(128); sleep(1); }

let access;
let addressId;
let loggedInAt = 0;
export function orderFlow() {
  if (!access || Date.now() - loggedInAt > 300000) {
    access = login(exec.vu.idInTest);
    loggedInAt = Date.now();
  }
  if (!addressId) {
    addressId = call('POST', '/addresses', 201, 'order', { label: 'Load fixture', address: 'Load fixture', latitude: 31.5, longitude: 34.45 }, access).id;
  }
  const cart = call('GET', '/cart', 200, 'order', undefined, access);
  const saved = call('PUT', '/cart', 200, 'order', { version: cart.version, items: [{ productId: Number(__ENV.PRODUCT_ID), quantity: 1, optionIds: [] }] }, access);
  const key = `${__ENV.RUN_ID || 'local-benchmark'}-${exec.vu.idInTest}-${exec.scenario.iterationInTest}`;
  const order = call('POST', '/orders', 201, 'order', { addressId, cartVersion: saved.version }, access, { 'Idempotency-Key': key });
  call('PATCH', `/orders/${order.id}/status`, 200, 'order', { action: 'cancel', version: order.version, reason: 'Benchmark fixture' }, access);
  sleep(0.7);
}
