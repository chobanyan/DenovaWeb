'use strict';
// Demo data: two patients with treatment plans and a few website requests.
// Dates are relative to "today" so the demo always looks current.

const iso = d => d.toISOString().slice(0, 10);
const shift = days => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() + days); return d; };
const workday = days => { const d = shift(days); if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1); return iso(d); };

module.exports = function seed() {
  const now = new Date().toISOString();
  return {
    patients: [
      {
        id: 'p-anna', name: 'Анна Григорян', phone: '+374 91 234 567',
        plan: 'Имплантация зубов 16 и 26, коронки из циркония',
        implants: [16, 26], missing: [18, 28, 38, 48],
        nextVisit: { date: workday(7), time: '11:30', what: 'Контрольный осмотр и снимок' },
        stages: [
          { t: 'Консультация и КТ', d: '3D-диагностика, план лечения, смета', start: iso(shift(-110)), end: iso(shift(-110)), cost: 15000, paid: true, status: 'done' },
          { t: 'Установка имплантов 16, 26', d: 'Straumann BLT, 2 импланта', start: iso(shift(-56)), end: iso(shift(-56)), cost: 500000, paid: true, status: 'done' },
          { t: 'Приживление имплантов', d: 'Остеоинтеграция, контрольный осмотр раз в месяц', start: iso(shift(-56)), end: iso(shift(66)), cost: 0, paid: true, status: 'current' },
          { t: 'Фиксация коронок', d: 'Две коронки из циркония на абатментах', start: iso(shift(104)), end: iso(shift(104)), cost: 240000, paid: false, status: 'planned' },
        ],
        updatedAt: now,
      },
      {
        id: 'p-david', name: 'Давид Саргсян', phone: '+374 77 111 222',
        plan: 'Верхняя челюсть, All-on-4',
        implants: [12, 14, 22, 24], missing: [11, 13, 15, 16, 17, 21, 23, 25, 26, 27],
        nextVisit: { date: workday(3), time: '15:00', what: 'Контрольный осмотр и снимок' },
        stages: [
          { t: 'Консультация и КТ', d: '3D-диагностика, план лечения, смета', start: iso(shift(-150)), end: iso(shift(-150)), cost: 15000, paid: true, status: 'done' },
          { t: 'Удаление зубов и установка 4 имплантов', d: 'Верхняя челюсть, All-on-4', start: iso(shift(-120)), end: iso(shift(-120)), cost: 1200000, paid: true, status: 'done' },
          { t: 'Временный несъёмный протез', d: 'Фиксация в течение 48 часов', start: iso(shift(-118)), end: iso(shift(2)), cost: 400000, paid: true, status: 'done' },
          { t: 'Постоянный протез на каркасе', d: 'Титановый каркас, циркониевые коронки', start: iso(shift(3)), end: iso(shift(24)), cost: 800000, paid: false, status: 'current' },
        ],
        updatedAt: now,
      },
    ],
    bookings: [
      { id: 'b-demo1', mode: 'clinic', name: 'Мариам Акопян', phone: '+374 93 555 010', msg: 'Нет одного зуба сбоку, хочу узнать про имплант', lang: 'ru', status: 'new', date: workday(2), time: '12:00', createdAt: now },
      { id: 'b-demo2', mode: 'online', name: 'John Miller', phone: '+1 415 555 0199', msg: '', lang: 'en', status: 'confirmed', date: workday(4), time: '17:30', createdAt: now },
      { id: 'b-demo3', mode: 'chat', name: 'Арам Петросян', phone: '+374 94 123 456', msg: 'Можно ли ставить импланты при диабете?', lang: 'ru', status: 'asked', createdAt: now },
    ],
  };
};
