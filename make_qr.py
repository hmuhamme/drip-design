"""
make_qr.py — print-ready QR code and A4 handout for the Drip Irrigation Design Workbench.

Usage:
    pip install segno pillow
    python make_qr.py

Edit the CONFIG block below, then run. Produces two files next to the script:
    drip_qr.png        high-resolution QR code on its own
    drip_handout.pdf   A4 sheet with title, QR code and instructions
"""

import segno
from PIL import Image, ImageDraw, ImageFont

# ----------------------------- CONFIG -----------------------------------
URL = "https://drip-design-hadi.netlify.app/"

TITLE = "Drip Irrigation Design Tool"
SUBTITLE = "Universitat Osnabruck / Hochschule Osnabruck"
LINE_1 = "Point your phone camera at the code."
LINE_2 = "No app to install. No login. Works offline once loaded."
FOOTER = URL
# ------------------------------------------------------------------------

# --- 1. Standalone QR code ------------------------------------------------
# error='h' tolerates ~30% damage, which matters for a printed handout that
# gets folded, rained on, or photographed at an angle in a field.
qr = segno.make(URL, error="h")
qr.save("drip_qr.png", scale=20, border=4, dark="#0f172a", light="white")
print("wrote drip_qr.png")

# --- 2. A4 handout --------------------------------------------------------
# A4 at 300 dpi = 2480 x 3508 px
W, H = 2480, 3508
sheet = Image.new("RGB", (W, H), "white")
draw = ImageDraw.Draw(sheet)


def font(size, bold=False):
    """Fall back gracefully if DejaVu is not present."""
    paths = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold
        else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
    ]
    for p in paths:
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            continue
    return ImageFont.load_default()


def centre(text, y, f, fill="#0f172a"):
    w = draw.textbbox((0, 0), text, font=f)[2]
    draw.text(((W - w) / 2, y), text, font=f, fill=fill)


centre(TITLE, 300, font(120, bold=True))
centre(SUBTITLE, 470, font(58), fill="#64748b")

# rule under the header
draw.line([(300, 600), (W - 300, 600)], fill="#0f172a", width=6)

# QR block, sized so the printed code is about 12 cm across
qr_px = 1500
qr_img = Image.open("drip_qr.png").resize((qr_px, qr_px), Image.LANCZOS)
sheet.paste(qr_img, ((W - qr_px) // 2, 780))

centre(LINE_1, 2420, font(76, bold=True))
centre(LINE_2, 2560, font(60), fill="#334155")

draw.line([(300, 2900), (W - 300, 2900)], fill="#cbd5e1", width=4)
centre(FOOTER, 2980, font(56), fill="#0e7490")
centre("Or type the address into any browser.", 3090, font(48), fill="#64748b")

sheet.save("drip_handout.pdf", "PDF", resolution=300.0)
print("wrote drip_handout.pdf  (A4, 300 dpi)")
