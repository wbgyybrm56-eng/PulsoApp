#!/usr/bin/env python3
"""Vuelve a generar index.html a partir de los archivos de src/.

Uso:  python3 construir.py
"""
from pathlib import Path

base = Path(__file__).resolve().parent
plantilla = (base / "src" / "plantilla.html").read_text(encoding="utf-8")
motor = (base / "src" / "motor-entrevista.js").read_text(encoding="utf-8")
mundo = (base / "src" / "mundo-3d.js").read_text(encoding="utf-8")

html = plantilla.replace("{{ENGINE}}", motor).replace("{{WORLD}}", mundo)
(base / "index.html").write_text(html, encoding="utf-8")
print("index.html generado:", len(html.encode("utf-8")), "bytes")
