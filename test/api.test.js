'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../server/app');

let server, base, dir;
before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'denova-'));
  server = createApp({ dataDir: dir, adminPassword: 'secret', smsCode: '1234' }).listen(0);
  await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

const call = async (method, url, body, token) => {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: r.status === 204 ? null : await r.json().catch(() => null) };
};

// next non-Sunday date, a few days out
const futureDay = (n = 5) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

test('serves the site', async () => {
  const r = await fetch(base + '/');
  assert.equal(r.status, 200);
  assert.match(await r.text(), /DENOVA/);
});

test('booking flow: create, see own, slot taken, cancel', async () => {
  const date = futureDay(6);
  const r = await call('POST', '/api/bookings', { mode: 'clinic', name: 'Тест', phone: '+374 99 000 111', date, time: '10:00', lang: 'ru' });
  assert.equal(r.status, 201);
  const { booking, key } = r.body;
  assert.equal(booking.status, 'new');
  assert.ok(key);

  const dup = await call('POST', '/api/bookings', { mode: 'online', name: 'X', phone: '+374 99 000 222', date, time: '10:00' });
  assert.equal(dup.status, 409);

  const slots = await call('GET', '/api/slots');
  assert.ok(slots.body.taken.some(s => s.date === date && s.time === '10:00'));
  assert.ok(!('name' in slots.body.taken[0]), 'slots must not leak personal data');

  const mine = await call('POST', '/api/bookings/mine', { items: [{ id: booking.id, key }, { id: booking.id, key: 'forged' }] });
  assert.equal(mine.body.bookings.length, 1);

  assert.equal((await call('POST', `/api/bookings/${booking.id}/cancel`, { key: 'forged' })).status, 404);
  assert.equal((await call('POST', `/api/bookings/${booking.id}/cancel`, { key })).status, 200);
  const again = await call('POST', '/api/bookings', { mode: 'clinic', name: 'Y', phone: '+374 99 000 333', date, time: '10:00' });
  assert.equal(again.status, 201, 'cancelled slot is free again');
});

test('booking validation', async () => {
  assert.equal((await call('POST', '/api/bookings', { mode: 'clinic', name: '', phone: '+374 99 000 111', date: futureDay(), time: '10:00' })).status, 400);
  assert.equal((await call('POST', '/api/bookings', { mode: 'clinic', name: 'A', phone: '12', date: futureDay(), time: '10:00' })).status, 400);
  assert.equal((await call('POST', '/api/bookings', { mode: 'clinic', name: 'A', phone: '+374 99 000 111', date: futureDay(), time: '10:30' })).status, 400);
  assert.equal((await call('POST', '/api/bookings', { mode: 'chat', name: 'A', phone: '+374 99 000 111' })).status, 400);
});

test('question with attachment reaches the clinic and gets answered', async () => {
  const png = Buffer.from('89504e470d0a1a0a', 'hex').toString('base64');
  const r = await call('POST', '/api/bookings', { mode: 'chat', name: 'Q', phone: '+374 99 111 222', msg: 'Больно?', attachment: { name: 'x.png', type: 'image/png', data: png } });
  assert.equal(r.status, 201);
  assert.equal(r.body.booking.status, 'asked');

  assert.equal((await call('GET', '/api/admin/bookings')).status, 401);
  assert.equal((await call('POST', '/api/admin/login', { password: 'nope' })).status, 401);
  const { token } = (await call('POST', '/api/admin/login', { password: 'secret' })).body;

  const list = (await call('GET', '/api/admin/bookings', undefined, token)).body.bookings;
  const q = list.find(b => b.id === r.body.booking.id);
  assert.ok(q.attachment.url);
  const file = await fetch(base + q.attachment.url + '?t=' + token);
  assert.equal(file.status, 200);
  assert.equal((await fetch(base + q.attachment.url)).status, 401);

  const ans = await call('PATCH', `/api/admin/bookings/${q.id}`, { answer: 'Нет' }, token);
  assert.equal(ans.body.booking.status, 'answered');
  const mine = await call('POST', '/api/bookings/mine', { items: [{ id: q.id, key: r.body.key }] });
  assert.equal(mine.body.bookings[0].answer, 'Нет');
});

test('patient portal login and clinic edits', async () => {
  assert.equal((await call('POST', '/api/auth/login', { phone: '+374 91 234 567', code: '0000' })).status, 401);
  assert.equal((await call('POST', '/api/auth/login', { phone: '+374 55 555 555', code: '1234' })).status, 404);
  const login = await call('POST', '/api/auth/login', { phone: '091 234 567', code: '1234' });
  assert.equal(login.status, 200);
  assert.equal(login.body.patient.name, 'Анна Григорян');
  const ptoken = login.body.token;

  assert.equal((await call('GET', '/api/admin/patients', undefined, ptoken)).status, 401, 'patient token is not admin');

  const { token } = (await call('POST', '/api/admin/login', { password: 'secret' })).body;
  const anna = (await call('GET', '/api/me', undefined, ptoken)).body.patient;
  const upd = await call('PUT', `/api/admin/patients/${anna.id}`, { ...anna, plan: 'Новый план', implants: [16, 26, 99] }, token);
  assert.equal(upd.status, 200);
  assert.deepEqual(upd.body.patient.implants, [16, 26]);
  assert.equal((await call('GET', '/api/me', undefined, ptoken)).body.patient.plan, 'Новый план');

  const dup = await call('POST', '/api/admin/patients', { name: 'Дубль', phone: '+374 91 234 567' }, token);
  assert.equal(dup.status, 409);
  const created = await call('POST', '/api/admin/patients', { name: 'Новый', phone: '+374 98 765 432', stages: [{ t: 'КТ', start: futureDay(), cost: 15000 }] }, token);
  assert.equal(created.status, 201);
  assert.equal((await call('DELETE', `/api/admin/patients/${created.body.patient.id}`, undefined, token)).status, 204);
});

test('data survives a restart', async () => {
  const app2 = createApp({ dataDir: dir, adminPassword: 'secret' });
  assert.ok(app2.locals.db.all('patients').some(p => p.plan === 'Новый план'));
});
