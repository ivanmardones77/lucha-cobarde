#!/usr/bin/env python3
"""Convierte una hoja de sprites con fondo verde (#00FF00) en un WebP transparente.

Uso:
  python3 tools/sprites/process_sheet.py IN.png OUT.webp --cols 4 --rows 4 [--lock-x]

- Quita el croma verde (con supresión de derrame en los bordes).
- Corta la rejilla en fotogramas, alinea todos por la línea de los pies
  (y, con --lock-x, también en horizontal por el centro de los pies,
  para que el idle no tiemble).
- Recorta al rectángulo común y escribe una hoja WebP en rejilla + un .json
  con frameW, frameH, cols, count.
"""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image


def key_green(rgb: np.ndarray) -> np.ndarray:
    r, g, b = (rgb[..., i].astype(np.float32) for i in range(3))
    other = np.maximum(r, b)
    dominance = g - other  # ~255 en fondo puro, <=0 en el personaje
    # Transición suave entre 40 (opaco) y 120 (transparente)
    alpha = np.clip((120.0 - dominance) / 80.0, 0.0, 1.0)
    # Supresión de derrame: el verde no puede superar al mayor de r/b
    g2 = np.minimum(g, other + 8)
    out = np.stack([r, g2, b, alpha * 255.0], axis=-1)
    return out.clip(0, 255).astype(np.uint8)


def key_magenta(rgb: np.ndarray) -> np.ndarray:
    """Para personajes con verde (p. ej. Valkyrie): fondo #FF00FF."""
    r, g, b = (rgb[..., i].astype(np.float32) for i in range(3))
    mn = np.minimum(r, b)
    dominance = mn - g
    alpha = np.clip((120.0 - dominance) / 80.0, 0.0, 1.0)
    # Derrame: resta el exceso magenta (min(r,b) por encima del verde)
    excess = np.where(alpha < 1.0, np.clip(mn - g - 8, 0, None), 0.0)
    r2, b2 = r - excess, b - excess
    out = np.stack([r2, g, b2, alpha * 255.0], axis=-1)
    return out.clip(0, 255).astype(np.uint8)


def clean_specks(alpha: np.ndarray, min_alpha: int = 24) -> np.ndarray:
    a = alpha.copy()
    a[a < min_alpha] = 0
    return a


def feet_anchor(alpha: np.ndarray) -> tuple[int, float]:
    rows = np.where(alpha.max(axis=1) > 128)[0]
    if len(rows) == 0:
        return alpha.shape[0] - 1, alpha.shape[1] / 2
    bottom = int(rows[-1])
    top = int(rows[0])
    band = alpha[max(top, bottom - int((bottom - top) * 0.12)) : bottom + 1]
    cols = np.where(band.max(axis=0) > 128)[0]
    cx = float((cols[0] + cols[-1]) / 2) if len(cols) else alpha.shape[1] / 2
    return bottom, cx


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--cols", type=int, default=4)
    ap.add_argument("--rows", type=int, default=4)
    ap.add_argument("--lock-x", action="store_true")
    ap.add_argument("--fixed-y", action="store_true")
    ap.add_argument("--pad", type=int, default=6)
    ap.add_argument("--quality", type=int, default=88)
    ap.add_argument("--key", choices=["green", "magenta"], default="green")
    args = ap.parse_args()

    img = np.array(Image.open(args.src).convert("RGB"))
    h, w = img.shape[:2]
    cw, ch = w // args.cols, h // args.rows
    # margen interior para no arrastrar restos de la celda vecina
    inset = 2

    frames = []
    for r in range(args.rows):
        for c in range(args.cols):
            # Bordes fraccionarios: la imagen no siempre es divisible entre 4
            y0 = int(round(r * h / args.rows)) + inset
            x0 = int(round(c * w / args.cols)) + inset
            cell = img[y0 : y0 + ch - 2 * inset, x0 : x0 + cw - 2 * inset]
            rgba = (key_magenta if args.key == "magenta" else key_green)(cell)
            rgba[..., 3] = clean_specks(rgba[..., 3])
            frames.append(rgba)

    anchors = [feet_anchor(f[..., 3]) for f in frames]
    ref_bottom = int(np.median([a[0] for a in anchors]))
    ref_cx = float(np.median([a[1] for a in anchors]))

    fh, fw = frames[0].shape[:2]
    big = 64
    canvas_frames = []
    for f, (bottom, cx) in zip(frames, anchors):
        # --fixed-y: respeta la línea de suelo original (saltos, ondas bajo los pies)
        dy = 0 if args.fixed_y else ref_bottom - bottom
        dx = int(round(ref_cx - cx)) if args.lock_x else 0
        cv = np.zeros((fh + 2 * big, fw + 2 * big, 4), np.uint8)
        y0, x0 = big + dy, big + dx
        cv[y0 : y0 + fh, x0 : x0 + fw] = f
        canvas_frames.append(cv)

    union = np.zeros(canvas_frames[0].shape[:2], bool)
    for cv in canvas_frames:
        union |= cv[..., 3] > 0
    ys, xs = np.where(union)
    y1, y2 = max(ys.min() - args.pad, 0), min(ys.max() + args.pad + 1, union.shape[0])
    x1, x2 = max(xs.min() - args.pad, 0), min(xs.max() + args.pad + 1, union.shape[1])
    crops = [cv[y1:y2, x1:x2] for cv in canvas_frames]
    FH, FW = crops[0].shape[:2]

    n = len(crops)
    cols = args.cols
    rows = (n + cols - 1) // cols
    sheet = Image.new("RGBA", (FW * cols, FH * rows), (0, 0, 0, 0))
    for i, cr in enumerate(crops):
        sheet.paste(Image.fromarray(cr, "RGBA"), ((i % cols) * FW, (i // cols) * FH))

    dst = Path(args.dst)
    dst.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(dst, "WEBP", quality=args.quality, method=6, exact=False)
    meta = {
        "frameW": FW,
        "frameH": FH,
        "cols": cols,
        "count": n,
        # punto de apoyo (centro de los pies) dentro de cada fotograma
        "anchorX": round(big + ref_cx - x1, 1),
        "anchorY": int(big + ref_bottom - y1),
    }
    dst.with_suffix(".json").write_text(json.dumps(meta, indent=2))
    print(dst, meta, f"{dst.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
