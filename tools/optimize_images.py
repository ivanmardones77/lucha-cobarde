#!/usr/bin/env python3
"""Convierte src/assets/images/*.jpg a WebP y actualiza los imports en src/.

Uso: python3 tools/optimize_images.py [--keep]   (--keep conserva los .jpg)

- Retratos (portrait_*): se reducen a 672x900; se ven como mucho a ~450 px.
- Efectos (vfx_*): misma resolución, calidad alta (los bordes de las chispas importan).
- Escenarios y fondos: misma resolución (son texturas 3D).
"""
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
IMAGES = ROOT / "src/assets/images"


def settings(name: str):
    if name.startswith("portrait_"):
        return (672, 900), 82
    if name.startswith("vfx_"):
        return None, 86
    return None, 80


def main() -> None:
    keep = "--keep" in sys.argv
    total_before = total_after = 0
    renamed = {}
    for jpg in sorted(IMAGES.glob("*.jpg")):
        size, quality = settings(jpg.name)
        im = Image.open(jpg).convert("RGB")
        if size and im.size != size:
            im = im.resize(size, Image.LANCZOS)
        out = jpg.with_suffix(".webp")
        im.save(out, "WEBP", quality=quality, method=6)
        b, a = jpg.stat().st_size, out.stat().st_size
        total_before += b
        total_after += a
        print(f"{jpg.name:50s} {b / 1024:6.0f} KB -> {a / 1024:5.0f} KB")
        renamed[jpg.name] = out.name
        if not keep:
            jpg.unlink()

    for ts in list((ROOT / "src").rglob("*.ts")) + [ROOT / "index.html"]:
        text = ts.read_text()
        new = text
        for old, nw in renamed.items():
            new = new.replace(old, nw)
        if new != text:
            ts.write_text(new)
            print("imports actualizados:", ts.relative_to(ROOT))

    print(f"TOTAL {total_before / 1048576:.1f} MB -> {total_after / 1048576:.1f} MB")


if __name__ == "__main__":
    main()
