# Denova — демо-сайт клиники имплантации

Лендинг клиники + запись на приём, вопросы врачу, кабинет пациента и панель клиники.
Три языка: русский, армянский, английский.

## Быстрый старт

```bash
npm install
npm start            # http://localhost:3000
```

Нужен Node.js 18+. Проверка: `npm test`.

| Что | Где | Демо-доступ |
|---|---|---|
| Сайт и запись | `/` | — |
| Кабинет пациента | `/#cabinet` | `+374 91 234 567` или `+374 77 111 222`, код `1234` |
| Панель клиники | `/#admin` (ссылка «Для клиники» в подвале) | пароль `denova` |

При первом запуске создаётся `data/db.json` с двумя демо-пациентами и тремя заявками.
Чтобы сбросить демо — удалите папку `data/`.

## Как устроено

```
public/            фронтенд без сборки
  index.html
  css/styles.css
  js/i18n.js       словарь [ru, hy, en]
  js/app.js        интерфейс + слой API (fetch)
server/
  app.js           Express: REST API + раздача public/
  store.js         хранилище в JSON-файле (атомарная запись)
  seed.js          демо-данные
test/api.test.js   тесты API (node:test)
```

### API

Публичное:
- `GET  /api/slots` — занятые слоты (без персональных данных)
- `POST /api/bookings` — запись `{mode: clinic|online|chat, name, phone, msg, date, time, attachment?}`; в ответ `key` — по нему посетитель видит и отменяет свою запись
- `POST /api/bookings/mine` — свои записи по парам `{id, key}`
- `POST /api/bookings/:id/cancel` — отмена `{key}`

Кабинет пациента:
- `POST /api/auth/login` `{phone, code}` → токен
- `GET  /api/me` — карта пациента

Панель клиники (Bearer-токен после `POST /api/admin/login {password}`):
- `GET/PATCH /api/admin/bookings[/:id]` — статус, ответ на вопрос
- `GET/POST/PUT/DELETE /api/admin/patients[/:id]` — карты лечения
- `GET /api/admin/uploads/:file` — вложения к вопросам

## Настройки

Переменные окружения (см. `.env.example`): `PORT`, `ADMIN_PASSWORD`, `DEMO_SMS_CODE`, `SESSION_SECRET`, `DATA_DIR`.

## Деплой

```bash
docker build -t denova .
docker run -p 3000:3000 -e ADMIN_PASSWORD=... -v denova-data:/app/data denova
```

Подойдёт любой хостинг с Node.js и постоянным диском (Render, Railway, Fly.io, VPS).

## Ограничения демо

- SMS не отправляются — код входа фиксированный (`DEMO_SMS_CODE`).
- Один пароль на всю клинику, без ролей.
- Данные в JSON-файле: для продакшена заменить `server/store.js` на PostgreSQL или SQLite.
- Обновления приходят опросом сервера раз в 15 секунд.
