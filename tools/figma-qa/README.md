# Проверка страницы по Figma (два агента)

| Что | Файл |
|---|---|
| Агент 1 — тестировщик: сверяет сайт с Figma, пишет баг-лист | `.claude/agents/figma-qa-tester.md` |
| Агент 2 — ревьюер: перепроверяет работу агента 1 | `.claude/agents/figma-qa-reviewer.md` |
| Команда, которая гоняет их по кругу до приёмки | `.claude/skills/figma-qa/SKILL.md` |
| Съёмка страницы (скриншоты, стили, ошибки) | `tools/figma-qa/capture.js` |
| Карта визуальных различий | `tools/figma-qa/visual_diff.py` |
| Проверка bugs.json и сборка Excel | `tools/figma-qa/bug_report.py` |

## Запуск

В Claude Code (нужен подключённый Figma MCP-сервер):

```
/figma-qa http://localhost:3000/ https://www.figma.com/design/<fileKey>/<name>?node-id=1-2
```

Если фреймов несколько (десктоп, планшет, мобильный) — передайте все ссылки.
Агентов можно вызывать и по отдельности: «запусти figma-qa-tester для …», «проверь
работу тестировщика в qa-reports/… агентом figma-qa-reviewer».

Как это работает:

1. `figma-qa-tester` снимает макет (Figma MCP) и сайт (Playwright) на тех же ширинах,
   сравнивает секцию за секцией, пишет `bugs.json` и собирает `bug-list.xlsx`.
2. `figma-qa-reviewer` сам перемеряет каждый баг в Figma и на сайте, ищет пропущенное
   и непроверенные секции, пишет `review.json` с вердиктом PASS/FAIL.
3. При FAIL тестировщик исправляет баг-лист по замечаниям, ревьюер проверяет снова
   (до 3 раундов).

Результат — `qa-reports/<дата>-<страница>/bug-list.xlsx` с листами:
**Баг-лист** (с фильтрами, цветом серьёзности, скриншотом и вердиктом ревьюера),
**Сводка**, **Покрытие** (какие секции и ширины проверены), **Пропущено** (если ревьюер
нашёл то, что не нашёл тестировщик).

## Папка запуска

```
qa-reports/2026-11-02-home/
  figma/            скриншоты макета
  site/             screenshot-<w>.png, dom-<w>.json, runtime-<w>.json
  diff/             карты различий
  evidence/         фрагменты макета и сайта для каждого бага
  scripts/          скрипты замеров тестировщика
  review-scripts/   скрипты замеров ревьюера
  review-evidence/  доказательства пропущенных багов
  bugs.json         баг-лист (источник для Excel)
  review.json       вердикт ревьюера
  bug-list.xlsx     итоговый файл
```

## Формат bugs.json

```json
{
  "meta": {
    "page_url": "http://localhost:3000/",
    "figma_url": "https://www.figma.com/design/…?node-id=1-2",
    "figma_node_ids": ["1:2", "1:300"],
    "viewports": [1440, 375],
    "date": "2026-11-02",
    "tolerances": "размеры ±2px, line-height ±1px, цвет и кегль — точно"
  },
  "coverage": [
    {"section": "Hero", "figma_node_id": "1:10", "viewport": 1440, "checked": true,
     "notes": "заголовок, подзаголовок, кнопки, фото, отступы"}
  ],
  "bugs": [
    {
      "id": "BUG-001",
      "title": "Hero: заголовок 40px вместо 48px",
      "section": "Hero",
      "element": ".hero h1",
      "figma_node_id": "1:12",
      "viewport": 1440,
      "category": "Typography",
      "severity": "Major",
      "expected": "Заголовок Inter Bold 48/56 (узел 1:12)",
      "actual": "Заголовок Inter Bold 40/48 (.hero h1)",
      "measured": {"property": "font-size", "figma": "48px", "site": "40px", "delta": "-8px"},
      "steps": ["Открыть страницу на ширине 1440px", "Посмотреть заголовок первого экрана"],
      "evidence": ["evidence/BUG-001-figma.png", "evidence/BUG-001-site.png"],
      "status": "New"
    }
  ]
}
```

- `category`: Layout, Spacing, Typography, Color, Content, Image, Icon, Component,
  Responsive, Interaction, Functional, Accessibility.
- `severity`: Critical, Major, Minor, Trivial.
- `measured` обязателен для Layout, Spacing, Typography, Color.
- Пути в `evidence` — относительно папки с `bugs.json`.

## Команды вручную

```bash
node tools/figma-qa/capture.js --url http://localhost:3000/ --out qa-reports/x/site --widths 1440,768,375
```

```bash
python3 tools/figma-qa/visual_diff.py qa-reports/x/figma/figma-1440.png qa-reports/x/site/screenshot-1440.png qa-reports/x/diff/diff-1440.png
```

```bash
python3 tools/figma-qa/bug_report.py check qa-reports/x/bugs.json
```

```bash
python3 tools/figma-qa/bug_report.py build qa-reports/x/bugs.json qa-reports/x/bug-list.xlsx --review qa-reports/x/review.json
```

```bash
python3 tools/figma-qa/bug_report.py verify qa-reports/x/bugs.json qa-reports/x/bug-list.xlsx
```

Нужны Node.js 18+ с Playwright и Python 3 с `openpyxl` и `Pillow`
(`pip install openpyxl pillow`, `npm i -D playwright && npx playwright install chromium`).
