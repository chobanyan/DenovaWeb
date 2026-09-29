'use strict';
// Tiny JSON-file store: whole DB in memory, flushed atomically to disk on every change.
// Good enough for a demo; swap for Postgres/SQLite when going to production.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class Store {
  constructor(file, seed) {
    this.file = file;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(file)) {
      this.data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } else {
      this.data = seed();
      this.flushSync();
    }
    for (const c of ['bookings', 'patients']) this.data[c] = this.data[c] || [];
    this.pending = Promise.resolve();
  }

  flushSync() {
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  // Writes are serialized so concurrent requests never interleave partial files.
  save() {
    this.pending = this.pending.then(() => this.flushSync()).catch(e => console.error('store: save failed', e));
    return this.pending;
  }

  all(c) { return this.data[c]; }
  get(c, id) { return this.data[c].find(x => x.id === id); }

  async add(c, doc) {
    const item = { ...doc, id: newId() };
    this.data[c].push(item);
    await this.save();
    return item;
  }

  async set(c, id, doc) {
    const i = this.data[c].findIndex(x => x.id === id);
    if (i < 0) return null;
    this.data[c][i] = { ...doc, id };
    await this.save();
    return this.data[c][i];
  }

  async update(c, id, patch) {
    const item = this.get(c, id);
    if (!item) return null;
    Object.assign(item, patch);
    await this.save();
    return item;
  }

  async del(c, id) {
    const n = this.data[c].length;
    this.data[c] = this.data[c].filter(x => x.id !== id);
    if (this.data[c].length === n) return false;
    await this.save();
    return true;
  }
}

const newId = () => crypto.randomBytes(9).toString('base64url');

module.exports = { Store, newId };
