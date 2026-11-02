#!/usr/bin/env python3
"""Баг-лист: проверка bugs.json и сборка Excel-файла.

    # проверить структуру bugs.json (агент-тестировщик запускает перед сдачей)
    python3 tools/figma-qa/bug_report.py check  <run>/bugs.json

    # собрать Excel (с результатами проверки агента-ревьюера, если есть review.json)
    python3 tools/figma-qa/bug_report.py build  <run>/bugs.json <run>/bug-list.xlsx [--review <run>/review.json]

    # сверить готовый Excel с bugs.json (агент-ревьюер)
    python3 tools/figma-qa/bug_report.py verify <run>/bugs.json <run>/bug-list.xlsx

Код выхода 0 — всё в порядке, 1 — найдены ошибки (они печатаются списком).
Формат bugs.json описан в tools/figma-qa/README.md.
"""
import argparse
import json
import os
import re
import sys

from openpyxl import Workbook, load_workbook
from openpyxl.drawing.image import Image as XLImage
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

SEVERITIES = ["Critical", "Major", "Minor", "Trivial"]
CATEGORIES = [
    "Layout", "Spacing", "Typography", "Color", "Content", "Image", "Icon",
    "Component", "Responsive", "Interaction", "Functional", "Accessibility",
]
STATUSES = ["New", "Confirmed", "Rejected", "Needs info", "Fixed", "Won't fix"]
REQUIRED = ["id", "title", "section", "viewport", "category", "severity", "expected", "actual", "steps", "evidence"]

COLUMNS = [
    ("ID", "id", 10),
    ("Название", "title", 40),
    ("Секция", "section", 16),
    ("Элемент (CSS)", "element", 28),
    ("Узел Figma", "figma_node_id", 12),
    ("Экран, px", "viewport", 10),
    ("Категория", "category", 13),
    ("Серьёзность", "severity", 12),
    ("Ожидается (Figma)", "expected", 36),
    ("Фактически (сайт)", "actual", 36),
    ("Свойство", "m_property", 16),
    ("Figma", "m_figma", 14),
    ("Сайт", "m_site", 14),
    ("Разница", "m_delta", 10),
    ("Шаги воспроизведения", "steps", 36),
    ("Доказательства", "evidence", 30),
    ("Скриншот", "_thumb", 26),
    ("Статус", "status", 12),
    ("Проверка ревьюера", "_review", 16),
    ("Комментарий ревьюера", "_review_note", 36),
]

SEV_FILL = {
    "Critical": "F8B4B4", "Major": "FBD38D", "Minor": "FEF3C7", "Trivial": "E5E7EB",
}
REVIEW_FILL = {"confirmed": "C6F6D5", "rejected": "FED7D7", "needs_fix": "FEEBC8"}
REVIEW_LABEL = {"confirmed": "Подтверждён", "rejected": "Отклонён", "needs_fix": "Нужна правка"}


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def base_dir(path):
    return os.path.dirname(os.path.abspath(path))


def validate(data, path):
    errs = []
    meta = data.get("meta") or {}
    for k in ["page_url", "figma_url", "viewports", "date"]:
        if not meta.get(k):
            errs.append(f"meta.{k}: не заполнено")
    bugs = data.get("bugs")
    if not isinstance(bugs, list):
        return errs + ["bugs: должен быть списком"]
    cov = data.get("coverage")
    if not isinstance(cov, list) or not cov:
        errs.append("coverage: пусто — укажите, какие секции и экраны проверены")
    seen_ids, seen_sig = set(), {}
    root = base_dir(path)
    for i, b in enumerate(bugs):
        tag = b.get("id") or f"bugs[{i}]"
        for k in REQUIRED:
            v = b.get(k)
            if v in (None, "", []):
                errs.append(f"{tag}: поле «{k}» пустое")
        if b.get("id"):
            if not re.fullmatch(r"BUG-\d{3,}", b["id"]):
                errs.append(f"{tag}: id должен быть вида BUG-001")
            if b["id"] in seen_ids:
                errs.append(f"{tag}: повторяющийся id")
            seen_ids.add(b["id"])
        if b.get("severity") and b["severity"] not in SEVERITIES:
            errs.append(f"{tag}: severity «{b['severity']}» не из {SEVERITIES}")
        if b.get("category") and b["category"] not in CATEGORIES:
            errs.append(f"{tag}: category «{b['category']}» не из {CATEGORIES}")
        if b.get("status") and b["status"] not in STATUSES:
            errs.append(f"{tag}: status «{b['status']}» не из {STATUSES}")
        exp, act = str(b.get("expected", "")).strip(), str(b.get("actual", "")).strip()
        if exp and exp == act:
            errs.append(f"{tag}: expected и actual совпадают — это не баг")
        m = b.get("measured")
        if m:
            if not m.get("property"):
                errs.append(f"{tag}: measured.property пустое")
            if str(m.get("figma")) == str(m.get("site")):
                errs.append(f"{tag}: measured.figma == measured.site")
        elif b.get("category") in ("Spacing", "Typography", "Color", "Layout"):
            errs.append(f"{tag}: для категории {b['category']} нужен блок measured (значения Figma и сайта)")
        for ev in b.get("evidence") or []:
            if not re.match(r"https?://", ev) and not os.path.exists(os.path.join(root, ev)):
                errs.append(f"{tag}: файл доказательства не найден: {ev}")
        sig = (str(b.get("element", "")).strip(), b.get("viewport"), (m or {}).get("property"), b.get("title", "").strip().lower())
        if sig[0] and sig in seen_sig:
            errs.append(f"{tag}: дубликат {seen_sig[sig]}")
        seen_sig.setdefault(sig, tag)
    return errs


def cell_value(b, key, review):
    m = b.get("measured") or {}
    if key == "m_property":
        return m.get("property", "")
    if key == "m_figma":
        return m.get("figma", "")
    if key == "m_site":
        return m.get("site", "")
    if key == "m_delta":
        return m.get("delta", "")
    if key == "evidence":
        return "\n".join(b.get("evidence") or [])
    if key == "_review":
        r = review.get(b.get("id"), {})
        return REVIEW_LABEL.get(r.get("verdict"), r.get("verdict", ""))
    if key == "_review_note":
        return review.get(b.get("id"), {}).get("comment", "")
    if key == "_thumb":
        return ""
    v = b.get(key, "")
    if key == "status" and not v:
        v = "New"
    if isinstance(v, list):
        return "\n".join(f"{i + 1}. {s}" for i, s in enumerate(v))
    return v


def build(bugs_path, out_path, review_path=None):
    data = load(bugs_path)
    errs = validate(data, bugs_path)
    if errs:
        print("bugs.json не прошёл проверку, Excel не собран:")
        print("\n".join(" - " + e for e in errs))
        return 1
    review_doc = load(review_path) if review_path and os.path.exists(review_path) else {}
    review = {r["id"]: r for r in review_doc.get("bugs", []) if r.get("id")}
    root = base_dir(bugs_path)
    sev_rank = {s: i for i, s in enumerate(SEVERITIES)}
    bugs = sorted(data["bugs"], key=lambda b: (sev_rank.get(b["severity"], 9), b["id"]))

    wb = Workbook()
    ws = wb.active
    ws.title = "Баг-лист"
    thin = Side(style="thin", color="BBBBBB")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    head_fill = PatternFill("solid", fgColor="1F2937")
    for c, (title, _, width) in enumerate(COLUMNS, 1):
        cell = ws.cell(row=1, column=c, value=title)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = head_fill
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = border
        ws.column_dimensions[get_column_letter(c)].width = width
    ws.row_dimensions[1].height = 32
    ws.freeze_panes = "C2"

    thumb_col = [k for _, k, _ in COLUMNS].index("_thumb") + 1
    sev_col = [k for _, k, _ in COLUMNS].index("severity") + 1
    rev_col = [k for _, k, _ in COLUMNS].index("_review") + 1
    for r, b in enumerate(bugs, 2):
        for c, (_, key, _) in enumerate(COLUMNS, 1):
            cell = ws.cell(row=r, column=c, value=cell_value(b, key, review))
            cell.alignment = Alignment(vertical="top", wrap_text=True)
            cell.border = border
        ws.cell(row=r, column=sev_col).fill = PatternFill("solid", fgColor=SEV_FILL[b["severity"]])
        rv = review.get(b["id"], {}).get("verdict")
        if rv in REVIEW_FILL:
            ws.cell(row=r, column=rev_col).fill = PatternFill("solid", fgColor=REVIEW_FILL[rv])
        ws.row_dimensions[r].height = 110
        img = next((e for e in b.get("evidence") or [] if e.lower().endswith((".png", ".jpg", ".jpeg"))), None)
        if img and os.path.exists(os.path.join(root, img)):
            try:
                pic = XLImage(os.path.join(root, img))
                k = min(180 / pic.width, 140 / pic.height, 1)
                pic.width, pic.height = int(pic.width * k), int(pic.height * k)
                ws.add_image(pic, f"{get_column_letter(thumb_col)}{r}")
            except Exception as e:  # картинка не должна ломать отчёт
                print(f"предупреждение: {b['id']}: не удалось вставить {img}: {e}")
    last = len(bugs) + 1
    ws.auto_filter.ref = f"A1:{get_column_letter(len(COLUMNS))}{max(last, 2)}"
    for col_key, values in (("severity", SEVERITIES), ("category", CATEGORIES), ("status", STATUSES)):
        c = get_column_letter([k for _, k, _ in COLUMNS].index(col_key) + 1)
        dv = DataValidation(type="list", formula1='"' + ",".join(values) + '"', allow_blank=True)
        ws.add_data_validation(dv)
        dv.add(f"{c}2:{c}{max(last, 200)}")

    # Сводка
    s = wb.create_sheet("Сводка")
    meta = data["meta"]
    rows = [
        ("Страница", meta.get("page_url")),
        ("Макет Figma", meta.get("figma_url")),
        ("Узлы Figma", ", ".join(meta.get("figma_node_ids", []) or [])),
        ("Экраны, px", ", ".join(str(v) for v in meta.get("viewports", []))),
        ("Дата проверки", meta.get("date")),
        ("Допуски", meta.get("tolerances", "")),
        ("Всего багов", len(bugs)),
    ]
    for sev in SEVERITIES:
        rows.append((f"  {sev}", sum(1 for b in bugs if b["severity"] == sev)))
    for cat in CATEGORIES:
        n = sum(1 for b in bugs if b["category"] == cat)
        if n:
            rows.append((f"  {cat}", n))
    if review_doc:
        rows += [
            ("", ""),
            ("Проверка ревьюера", review_doc.get("verdict", "")),
            ("Итог ревьюера", review_doc.get("summary", "")),
            ("Подтверждено", sum(1 for r in review.values() if r.get("verdict") == "confirmed")),
            ("Отклонено", sum(1 for r in review.values() if r.get("verdict") == "rejected")),
            ("Нужна правка", sum(1 for r in review.values() if r.get("verdict") == "needs_fix")),
            ("Пропущено тестировщиком", len(review_doc.get("missed_bugs", []))),
        ]
    for r, (k, v) in enumerate(rows, 1):
        s.cell(row=r, column=1, value=k).font = Font(bold=not k.startswith("  "))
        s.cell(row=r, column=2, value=v).alignment = Alignment(wrap_text=True, vertical="top")
    s.column_dimensions["A"].width = 28
    s.column_dimensions["B"].width = 90

    # Покрытие
    cv = wb.create_sheet("Покрытие")
    heads = ["Секция", "Узел Figma", "Экран, px", "Проверено", "Что сверено", "Найдено багов"]
    for c, h in enumerate(heads, 1):
        cell = cv.cell(row=1, column=c, value=h)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = head_fill
    for r, item in enumerate(data.get("coverage", []), 2):
        n = sum(1 for b in bugs if b["section"] == item.get("section") and str(b["viewport"]) == str(item.get("viewport")))
        vals = [item.get("section"), item.get("figma_node_id"), item.get("viewport"),
                "да" if item.get("checked") else "НЕТ", item.get("notes", ""), n]
        for c, v in enumerate(vals, 1):
            cv.cell(row=r, column=c, value=v).alignment = Alignment(wrap_text=True, vertical="top")
    for c, w in enumerate([20, 14, 10, 11, 70, 14], 1):
        cv.column_dimensions[get_column_letter(c)].width = w

    # Пропущенные баги, найденные ревьюером
    missed = review_doc.get("missed_bugs", [])
    if missed:
        ms = wb.create_sheet("Пропущено")
        heads = ["Название", "Секция", "Экран, px", "Серьёзность", "Ожидается (Figma)", "Фактически (сайт)", "Доказательства"]
        for c, h in enumerate(heads, 1):
            cell = ms.cell(row=1, column=c, value=h)
            cell.font = Font(bold=True, color="FFFFFF")
            cell.fill = head_fill
            ms.column_dimensions[get_column_letter(c)].width = 30
        for r, m in enumerate(missed, 2):
            vals = [m.get("title"), m.get("section"), m.get("viewport"), m.get("severity"),
                    m.get("expected"), m.get("actual"), "\n".join(m.get("evidence") or [])]
            for c, v in enumerate(vals, 1):
                ms.cell(row=r, column=c, value=v).alignment = Alignment(wrap_text=True, vertical="top")

    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    wb.save(out_path)
    print(f"Excel сохранён: {out_path} — {len(bugs)} багов")
    return 0


def verify(bugs_path, xlsx_path):
    data = load(bugs_path)
    errs = validate(data, bugs_path)
    if not os.path.exists(xlsx_path):
        errs.append(f"Excel не найден: {xlsx_path}")
    else:
        wb = load_workbook(xlsx_path)
        for name in ("Баг-лист", "Сводка", "Покрытие"):
            if name not in wb.sheetnames:
                errs.append(f"в Excel нет листа «{name}»")
        if "Баг-лист" in wb.sheetnames:
            ws = wb["Баг-лист"]
            header = [c.value for c in ws[1]]
            expected_header = [t for t, _, _ in COLUMNS]
            if header[: len(expected_header)] != expected_header:
                errs.append("заголовки листа «Баг-лист» не совпадают с шаблоном")
            ids_x = [ws.cell(row=r, column=1).value for r in range(2, ws.max_row + 1) if ws.cell(row=r, column=1).value]
            ids_j = [b.get("id") for b in data.get("bugs", [])]
            if sorted(ids_x) != sorted(ids_j):
                errs.append(f"ID в Excel и bugs.json не совпадают: только в Excel {sorted(set(ids_x) - set(ids_j))}, только в JSON {sorted(set(ids_j) - set(ids_x))}")
            empty = []
            req_cols = [i + 1 for i, (_, k, _) in enumerate(COLUMNS) if k in REQUIRED]
            for r in range(2, ws.max_row + 1):
                for c in req_cols:
                    if ws.cell(row=r, column=c).value in (None, ""):
                        empty.append(f"{ws.cell(row=r, column=1).value}:{COLUMNS[c - 1][0]}")
            if empty:
                errs.append("пустые обязательные ячейки в Excel: " + ", ".join(empty[:20]))
    if errs:
        print("Найдены проблемы:")
        print("\n".join(" - " + e for e in errs))
        return 1
    print(f"OK: bugs.json и {xlsx_path} согласованы, {len(data['bugs'])} багов")
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("check"); c.add_argument("bugs")
    b = sub.add_parser("build"); b.add_argument("bugs"); b.add_argument("out"); b.add_argument("--review")
    v = sub.add_parser("verify"); v.add_argument("bugs"); v.add_argument("xlsx")
    a = ap.parse_args()
    if a.cmd == "check":
        errs = validate(load(a.bugs), a.bugs)
        if errs:
            print("Найдены проблемы:")
            print("\n".join(" - " + e for e in errs))
            return 1
        print("OK: bugs.json корректен")
        return 0
    if a.cmd == "build":
        return build(a.bugs, a.out, a.review)
    return verify(a.bugs, a.xlsx)


if __name__ == "__main__":
    sys.exit(main())
