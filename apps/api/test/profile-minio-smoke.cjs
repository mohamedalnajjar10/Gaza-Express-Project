/* Pipe this file to docker compose exec -T --index 1 api node.
 * Uses disposable accounts and removes their database rows and uploaded objects.
 */
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { Client } = require('minio');
const jwt = require('jsonwebtoken');
const sharp = require('sharp');
const db = new PrismaClient();
const endpoint = new URL(process.env.PRODUCT_MEDIA_ENDPOINT);
const storage = new Client({ endPoint: endpoint.hostname, port: Number(endpoint.port) || undefined, useSSL: endpoint.protocol === 'https:', region: 'us-east-1', accessKey: process.env.PRODUCT_MEDIA_ACCESS_KEY, secretKey: process.env.PRODUCT_MEDIA_SECRET_KEY });
const base = 'http://gateway/api/v1';
const tag = Date.now();
const users = [];
const paths = new Set();
const headers = token => ({ Authorization: `Bearer ${token}` });
async function check(response, status) {
  assert.equal(response.status, status, `Unexpected HTTP status: ${response.status}; expected ${status}`);
  if (response.headers.get('content-type')?.includes('json')) return (await response.json()).data;
  return response;
}
async function main() {
  const image = await sharp({create: {width: 48, height: 48, channels: 3, background: '#216e56'}}).png().toBuffer();
  for (const role of ['customer', 'store_owner', 'driver', 'admin']) {
    const user = await db.user.create({data: {phone: `qa${tag}${users.length}`, full_name: 'Profile QA', password_hash: '', role, is_verified: true}});
    const token = jwt.sign({sub: user.user_id, phone: user.phone, role, isActive: true}, process.env.JWT_SECRET, {expiresIn: '5m'});
    users.push({...user, token});
    const form = new FormData();
    form.set('full_name', 'أحمد اختبار الصورة');
    form.set('email', `qa-${tag}-${role}@example.com`);
    form.set('image', new Blob([image], {type: 'image/png'}), 'avatar.png');
    const saved = await check(await fetch(`${base}/account/profile`, {method: 'PATCH', headers: headers(token), body: form}), 200);
    assert.equal(saved.full_name, 'أحمد اختبار الصورة');
    assert.equal(saved.role, role);
    assert.equal(saved.password_hash, undefined);
    assert.match(saved.profile_photo_url, /^\/api\/v1\/account\/images\/[a-f0-9-]+\.webp$/);
    paths.add(saved.profile_photo_url);
    user.photo = saved.profile_photo_url;
    users[users.length - 1].photo = saved.profile_photo_url;
    const current = await check(await fetch(`${base}/auth/profile`, {headers: headers(token)}), 200);
    assert.equal(current.email, saved.email);
    assert.equal(current.profile_photo_url, saved.profile_photo_url);
    const response = await check(await fetch(`http://gateway${saved.profile_photo_url}`, {headers: headers(token)}), 200);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal((await sharp(bytes).metadata()).format, 'webp');
    const object = await storage.statObject('product-media', `profiles/${saved.profile_photo_url.split('/').pop()}`);
    assert.equal(object.size, bytes.length);
    console.log(`PASS ${role}: editable profile persisted and image stored in MinIO`);
  }
  const [first, second] = users;
  await check(await fetch(`${base}/account/profile`, {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({full_name: 'No session'})}), 401);
  await check(await fetch(`${base}/account/profile`, {method: 'PATCH', headers: {...headers(first.token), 'Content-Type': 'application/json'}, body: JSON.stringify({role: 'admin'})}), 400);
  await check(await fetch(`http://gateway${first.photo}`, {headers: headers(second.token)}), 404);
  const bad = new FormData(); bad.set('image', new Blob(['not an image'], {type:'image/png'}), 'fake.png');
  await check(await fetch(`${base}/account/profile`, {method: 'PATCH', headers: headers(first.token), body: bad}), 400);
  const large = new FormData(); large.set('image', new Blob([Buffer.alloc(5 * 1024 * 1024 + 1)], {type:'image/png'}), 'large.png');
  await check(await fetch(`${base}/account/profile`, {method: 'PATCH', headers: headers(first.token), body: large}), 413);
  const conflict = new FormData(); conflict.set('email', `qa-${tag}-store_owner@example.com`); conflict.set('image', new Blob([image], {type:'image/png'}), 'avatar.png');
  await check(await fetch(`${base}/account/profile`, {method: 'PATCH', headers: headers(first.token), body: conflict}), 409);
  assert.equal((await db.user.findUnique({where: {user_id: first.user_id}})).profile_photo_url, first.photo);
  const replacement = new FormData(); replacement.set('image', new Blob([image], {type:'image/png'}), 'new.png');
  const updated = await check(await fetch(`${base}/account/profile`, {method: 'PATCH', headers: headers(first.token), body: replacement}), 200);
  paths.add(updated.profile_photo_url);
  await assert.rejects(storage.statObject('product-media', `profiles/${first.photo.split('/').pop()}`), e => ['NotFound', 'NoSuchKey'].includes(e.code));
  console.log('PASS authorization, privilege rejection, invalid/oversized uploads, email conflict, and old-image removal');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  for (const user of users) {
    const current = await db.user.findUnique({where: {user_id: user.user_id}, select: {profile_photo_url: true}});
    if (current?.profile_photo_url) paths.add(current.profile_photo_url);
  }
  for (const path of paths) await storage.removeObject('product-media', `profiles/${path.split('/').pop()}`);
  if (users.length) await db.user.deleteMany({where: {user_id: {in: users.map(u => u.user_id)}}});
  await db.$disconnect();
  console.log('Removed disposable QA accounts and images');
});
