'use strict';
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Store } = require('./store');
const seed = require('./seed');

const MODES = ['clinic', 'online', 'chat'];
const HOURS = {
  clinic: ['10:00', '11:00', '12:00', '13:00', '15:00', '16:00', '17:00', '18:00'],
  online: ['10:00', '10:30', '11:00', '13:00', '13:30', '17:00', '17:30', '18:00'],
};
const BOOKING_STATUS = ['new', 'confirmed', 'done', 'cancelled', 'asked', 'answered'];
const STAGE_STATUS = ['planned', 'current', 'done'];
const ATTACH_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/heic': '.heic', 'application/pdf': '.pdf' };
const MAX_ATTACH = 5 * 1024 * 1024;

const digits = s => String(s || '').replace(/\D/g, '');
const samePhone = (a, b) => { const x = digits(a), y = digits(b); return x.length >= 8 && y.length >= 8 && x.slice(-8) === y.slice(-8); };
const str = (v, max) => String(v ?? '').trim().slice(0, max);
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T00:00:00Z'));
const dayDiff = s => Math.round((new Date(s + 'T00:00:00Z') - new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z')) / 864e5);
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

class HttpError extends Error { constructor(status, code) { super(code); this.status = status; this.code = code; } }
const fail = (status, code) => { throw new HttpError(status, code); };

function createApp(opts = {}) {
  const dataDir = opts.dataDir || process.env.DATA_DIR || path.join(__dirname, '..', 'data');
  const adminPassword = opts.adminPassword || process.env.ADMIN_PASSWORD || 'denova';
  const smsCode = opts.smsCode || process.env.DEMO_SMS_CODE || '1234';
  const db = new Store(path.join(dataDir, 'db.json'), seed);
  const uploadDir = path.join(dataDir, 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });

  // Signed, stateless session tokens: base64url(payload).hmac
  const secretFile = path.join(dataDir, 'secret');
  const secret = opts.secret || process.env.SESSION_SECRET ||
    (fs.existsSync(secretFile) ? fs.readFileSync(secretFile, 'utf8') : (() => { const s = crypto.randomBytes(32).toString('hex'); fs.writeFileSync(secretFile, s, { mode: 0o600 }); return s; })());
  const sign = body => crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const issue = (payload, days) => { const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + days * 864e5 })).toString('base64url'); return body + '.' + sign(body); };
  const verify = token => {
    const [body, sig] = String(token || '').split('.');
    if (!body || !sig || !safeEq(sig, sign(body))) return null;
    try { const p = JSON.parse(Buffer.from(body, 'base64url').toString()); return p.exp > Date.now() ? p : null; } catch { return null; }
  };
  // Per-booking secret so an anonymous visitor can see and cancel only their own requests.
  const bookingKey = id => sign('booking:' + id);

  const bearer = req => (req.get('authorization') || '').replace(/^Bearer\s+/i, '') || req.query.t;
  const needAdmin = (req, res, next) => { const p = verify(bearer(req)); if (p && p.role === 'admin') return next(); next(new HttpError(401, 'unauthorized')); };
  const needPatient = (req, res, next) => {
    const p = verify(bearer(req));
    const patient = p && p.role === 'patient' && db.get('patients', p.pid);
    if (!patient) return next(new HttpError(401, 'unauthorized'));
    req.patient = patient; next();
  };

  const publicBooking = b => {
    const { key, attachment, ...rest } = b;
    return attachment ? { ...rest, attachment: { name: attachment.name, type: attachment.type } } : rest;
  };
  const adminBooking = b => b.attachment ? { ...b, attachment: { ...b.attachment, url: `/api/admin/uploads/${b.attachment.file}` } } : b;
  const takenSlot = (date, time) => db.all('bookings').some(b => b.mode !== 'chat' && b.date === date && b.time === time && b.status !== 'cancelled');

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '8mb' }));
  const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  /* ---------- public: booking ---------- */
  app.get('/api/slots', (req, res) => {
    const taken = db.all('bookings')
      .filter(b => b.mode !== 'chat' && b.status !== 'cancelled' && b.date && dayDiff(b.date) >= 0)
      .map(b => ({ date: b.date, time: b.time }));
    res.json({ taken });
  });

  app.post('/api/bookings', wrap(async (req, res) => {
    const b = req.body || {};
    const mode = MODES.includes(b.mode) ? b.mode : fail(400, 'bad_mode');
    const name = str(b.name, 100) || fail(400, 'name_required');
    const phone = str(b.phone, 40);
    if (digits(phone).length < 8) fail(400, 'phone_required');
    const msg = str(b.msg, 2000);
    const lang = ['ru', 'hy', 'en'].includes(b.lang) ? b.lang : 'ru';
    const doc = { mode, name, phone, msg, lang, status: mode === 'chat' ? 'asked' : 'new', createdAt: new Date().toISOString() };
    if (mode === 'chat') {
      if (!msg) fail(400, 'question_required');
    } else {
      if (!isDate(b.date)) fail(400, 'bad_date');
      const diff = dayDiff(b.date);
      if (diff < 0 || diff > 31 || new Date(b.date + 'T00:00:00Z').getUTCDay() === 0) fail(400, 'bad_date');
      if (!HOURS[mode].includes(b.time)) fail(400, 'bad_time');
      if (takenSlot(b.date, b.time)) fail(409, 'slot_taken');
      doc.date = b.date; doc.time = b.time;
    }
    if (mode === 'chat' && b.attachment && b.attachment.data) {
      const ext = ATTACH_TYPES[b.attachment.type] || fail(400, 'bad_attachment');
      const buf = Buffer.from(String(b.attachment.data), 'base64');
      if (!buf.length || buf.length > MAX_ATTACH) fail(413, 'attachment_too_large');
      const file = crypto.randomBytes(12).toString('hex') + ext;
      fs.writeFileSync(path.join(uploadDir, file), buf);
      doc.attachment = { file, name: str(b.attachment.name, 120) || file, type: b.attachment.type, size: buf.length };
    }
    const saved = await db.add('bookings', doc);
    res.status(201).json({ booking: publicBooking(saved), key: bookingKey(saved.id) });
  }));

  // The visitor's own requests: [{id, key}] pairs kept in their browser.
  app.post('/api/bookings/mine', (req, res) => {
    const items = Array.isArray(req.body && req.body.items) ? req.body.items.slice(0, 50) : [];
    const list = items
      .filter(x => x && typeof x.id === 'string' && safeEq(x.key || '', bookingKey(x.id)))
      .map(x => db.get('bookings', x.id)).filter(Boolean).map(publicBooking);
    res.json({ bookings: list });
  });

  app.post('/api/bookings/:id/cancel', wrap(async (req, res) => {
    const b = db.get('bookings', req.params.id);
    if (!b || !safeEq((req.body && req.body.key) || '', bookingKey(b.id))) fail(404, 'not_found');
    if (b.mode === 'chat' || !['new', 'confirmed'].includes(b.status)) fail(409, 'cannot_cancel');
    await db.update('bookings', b.id, { status: 'cancelled', cancelledAt: new Date().toISOString() });
    res.json({ booking: publicBooking(b) });
  }));

  /* ---------- patient portal ---------- */
  app.post('/api/auth/code', (req, res) => {
    // Demo: no SMS gateway is wired up; the code is fixed (DEMO_SMS_CODE).
    if (digits(req.body && req.body.phone).length < 8) fail(400, 'phone_required');
    res.json({ sent: true, demo: true });
  });

  app.post('/api/auth/login', (req, res) => {
    const { phone, code } = req.body || {};
    if (!safeEq(str(code, 10), smsCode)) fail(401, 'bad_code');
    const p = db.all('patients').find(x => samePhone(x.phone, phone));
    if (!p) fail(404, 'patient_not_found');
    res.json({ token: issue({ role: 'patient', pid: p.id }, 30), patient: p });
  });

  app.get('/api/me', needPatient, (req, res) => res.json({ patient: req.patient }));

  /* ---------- clinic admin ---------- */
  app.post('/api/admin/login', (req, res) => {
    if (!safeEq(str(req.body && req.body.password, 200), adminPassword)) fail(401, 'bad_password');
    res.json({ token: issue({ role: 'admin' }, 7) });
  });

  app.get('/api/admin/bookings', needAdmin, (req, res) => {
    const list = [...db.all('bookings')].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    res.json({ bookings: list.map(b => { const { key, ...rest } = adminBooking(b); return rest; }) });
  });

  app.patch('/api/admin/bookings/:id', needAdmin, wrap(async (req, res) => {
    const b = db.get('bookings', req.params.id) || fail(404, 'not_found');
    const patch = {};
    if (req.body.status !== undefined) {
      if (!BOOKING_STATUS.includes(req.body.status)) fail(400, 'bad_status');
      patch.status = req.body.status;
    }
    if (req.body.answer !== undefined) {
      if (b.mode !== 'chat') fail(400, 'not_a_question');
      patch.answer = str(req.body.answer, 4000) || fail(400, 'answer_required');
      patch.status = 'answered';
      patch.answeredAt = new Date().toISOString();
    }
    res.json({ booking: adminBooking(await db.update('bookings', b.id, patch)) });
  }));

  app.get('/api/admin/uploads/:file', needAdmin, (req, res) => {
    const file = path.basename(req.params.file);
    const b = db.all('bookings').find(x => x.attachment && x.attachment.file === file) || fail(404, 'not_found');
    res.type(b.attachment.type).sendFile(path.join(uploadDir, file));
  });

  const cleanPatient = (body, selfId) => {
    const name = str(body.name, 120), phone = str(body.phone, 40);
    if (!name || digits(phone).length < 8) fail(400, 'name_phone_required');
    const dup = db.all('patients').find(p => p.id !== selfId && samePhone(p.phone, phone));
    if (dup) throw Object.assign(new HttpError(409, 'phone_taken'), { extra: { patient: dup.name } });
    const teeth = v => (Array.isArray(v) ? v : []).map(Number).filter(n => Number.isInteger(n) && n >= 11 && n <= 48);
    const nv = body.nextVisit || {};
    const stages = (Array.isArray(body.stages) ? body.stages : []).slice(0, 50).map(s => ({
      t: str(s.t, 200), d: str(s.d, 500),
      start: isDate(s.start) ? s.start : '', end: isDate(s.end) ? s.end : (isDate(s.start) ? s.start : ''),
      cost: Math.max(0, Math.round(+s.cost || 0)), paid: !!s.paid,
      status: STAGE_STATUS.includes(s.status) ? s.status : 'planned',
    })).filter(s => s.t && s.start).sort((a, b) => a.start.localeCompare(b.start));
    return {
      name, phone, plan: str(body.plan, 500), implants: teeth(body.implants), missing: teeth(body.missing),
      nextVisit: { date: isDate(nv.date) ? nv.date : '', time: str(nv.time, 10), what: str(nv.what, 200) },
      stages, updatedAt: new Date().toISOString(),
    };
  };

  app.get('/api/admin/patients', needAdmin, (req, res) => res.json({ patients: db.all('patients') }));
  app.post('/api/admin/patients', needAdmin, wrap(async (req, res) => {
    res.status(201).json({ patient: await db.add('patients', cleanPatient(req.body || {}, null)) });
  }));
  app.put('/api/admin/patients/:id', needAdmin, wrap(async (req, res) => {
    if (!db.get('patients', req.params.id)) fail(404, 'not_found');
    res.json({ patient: await db.set('patients', req.params.id, cleanPatient(req.body || {}, req.params.id)) });
  }));
  app.delete('/api/admin/patients/:id', needAdmin, wrap(async (req, res) => {
    if (!(await db.del('patients', req.params.id))) fail(404, 'not_found');
    res.status(204).end();
  }));

  app.use('/api', (req, res, next) => next(new HttpError(404, 'not_found')));

  /* ---------- frontend ---------- */
  app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

  app.use((err, req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.code, ...(err.extra || {}) });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'attachment_too_large' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_json' });
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  });

  app.locals.db = db;
  return app;
}

module.exports = { createApp };
