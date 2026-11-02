#!/usr/bin/env python3
"""Визуальное сравнение макета Figma и скриншота сайта.

Приводит оба изображения к одной ширине, строит карту различий (красным) и
считает процент отличающихся пикселей. Нужен как подсказка, где искать баги,
а не как доказательство: каждое различие надо подтвердить измерением.

    python3 tools/figma-qa/visual_diff.py figma.png site.png diff.png [--threshold 40]

Выход: diff.png (макет | сайт | различия) и JSON-строка со статистикой
и списком областей с наибольшими различиями (координаты в пикселях макета).
"""
import argparse
import json
import sys

from PIL import Image, ImageChops, ImageDraw


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("figma")
    ap.add_argument("site")
    ap.add_argument("out")
    ap.add_argument("--threshold", type=int, default=40, help="порог разницы яркости 0-255")
    ap.add_argument("--grid", type=int, default=40, help="размер ячейки для поиска областей, px")
    a = ap.parse_args()

    fig = Image.open(a.figma).convert("RGB")
    site = Image.open(a.site).convert("RGB")
    w = fig.width
    if site.width != w:
        site = site.resize((w, round(site.height * w / site.width)), Image.LANCZOS)
    h = max(fig.height, site.height)

    def pad(img):
        canvas = Image.new("RGB", (w, h), (255, 255, 255))
        canvas.paste(img, (0, 0))
        return canvas

    f, s = pad(fig), pad(site)
    diff = ImageChops.difference(f, s).convert("L")
    mask = diff.point(lambda v: 255 if v > a.threshold else 0)
    changed = mask.histogram()[255]
    total = w * h

    overlay = s.copy()
    red = Image.new("RGB", (w, h), (255, 0, 0))
    overlay.paste(red, (0, 0), mask)

    regions = []
    g = a.grid
    for y in range(0, h, g):
        for x in range(0, w, g):
            box = (x, y, min(x + g, w), min(y + g, h))
            cell = mask.crop(box)
            n = cell.histogram()[255]
            area = (box[2] - box[0]) * (box[3] - box[1])
            if n / area > 0.15:
                regions.append({"x": x, "y": y, "w": box[2] - box[0], "h": box[3] - box[1], "ratio": round(n / area, 2)})
    regions.sort(key=lambda r: -r["ratio"])

    sheet = Image.new("RGB", (w * 3 + 20, h), (230, 230, 230))
    sheet.paste(f, (0, 0))
    sheet.paste(s, (w + 10, 0))
    sheet.paste(overlay, (2 * w + 20, 0))
    d = ImageDraw.Draw(sheet)
    for r in regions[:50]:
        d.rectangle([2 * w + 20 + r["x"], r["y"], 2 * w + 20 + r["x"] + r["w"], r["y"] + r["h"]], outline=(0, 0, 255))
    sheet.save(a.out)

    print(json.dumps({
        "figma_size": [fig.width, fig.height],
        "site_size_scaled": [site.width, site.height],
        "height_mismatch_px": site.height - fig.height,
        "diff_percent": round(100 * changed / total, 2),
        "top_regions": regions[:20],
        "out": a.out,
    }, ensure_ascii=False))


if __name__ == "__main__":
    sys.exit(main())
