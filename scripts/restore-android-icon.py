#!/usr/bin/env python3
"""Generate Android legacy launcher icons from the canonical Sai Sai SVG logo."""
from pathlib import Path
import subprocess
import sys

try:
    import cairosvg
    from PIL import Image
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "cairosvg", "Pillow"])
    import cairosvg
    from PIL import Image

root = Path("android/app/src/main/res")
svg = Path("public/icon-512.svg")
if not svg.exists():
    svg = Path("public/icon-192.svg")
if not svg.exists():
    raise SystemExit("Sai Sai logo SVG was not found in public/")

# The SVG is the official, square app logo; render it at high resolution once.
png_bytes = cairosvg.svg2png(url=str(svg), output_width=1024, output_height=1024)
import io
source = Image.open(io.BytesIO(png_bytes)).convert("RGBA")

# Use legacy launcher resources so Android cannot keep showing Capacitor's
# default adaptive icon instead of the supplied brand logo.
for density, size in {
    "mdpi": 48,
    "hdpi": 72,
    "xhdpi": 96,
    "xxhdpi": 144,
    "xxxhdpi": 192,
}.items():
    folder = root / f"mipmap-{density}"
    folder.mkdir(parents=True, exist_ok=True)
    icon = source.resize((size, size), Image.Resampling.LANCZOS)
    icon.save(folder / "ic_launcher.png", optimize=True)
    icon.save(folder / "ic_launcher_round.png", optimize=True)

# Remove adaptive-icon XMLs that override the legacy logo on Android 8+.
adaptive = root / "mipmap-anydpi-v26"
for name in ("ic_launcher.xml", "ic_launcher_round.xml"):
    target = adaptive / name
    if target.exists():
        target.unlink()

print("Sai Sai launcher logo installed in Android mipmap resources.")
