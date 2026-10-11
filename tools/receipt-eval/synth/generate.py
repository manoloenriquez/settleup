#!/usr/bin/env python3 -I
"""Synthetic receipt set for the receipt benchmark.

Renders receipts whose ground truth is known by construction (the numbers are
computed here, then printed), plus degraded copies (rotation, blur, low
contrast + noise, low resolution + heavy JPEG). These are NOT real receipts and
are reported separately from the photographed ones in
sample-inputs/receipts/*.jpg. Deterministic: same output on every run.

    python3 -I tools/receipt-eval/synth/generate.py   # writes sample-inputs/receipts/synthetic/
"""
import json
import os
import random
import zlib
from decimal import ROUND_HALF_UP, Decimal

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
OUT = os.path.join(ROOT, "sample-inputs", "receipts", "synthetic")
EXPECTED = os.path.join(OUT, "expected")
FONT = "/System/Library/Fonts/Menlo.ttc"
D = Decimal


def money(x):
    return D(x).quantize(D("0.01"), rounding=ROUND_HALF_UP)


def fmt(x):
    return f"{money(x):,.2f}"


class Receipt:
    def __init__(self, rid, merchant, date, currency, lines, expected, notes):
        self.rid, self.merchant, self.date, self.currency = rid, merchant, date, currency
        self.lines, self.expected, self.notes = lines, expected, notes


def ph_restaurant():
    items = [("Sinigang na Baboy", 1, "385.00"), ("Kare-Kare", 1, "495.00"), ("Garlic Rice", 3, "65.00"),
             ("Calamansi Juice", 2, "95.00"), ("Halo-Halo Special", 1, "185.00")]
    sub = sum(money(D(p) * q) for _, q, p in items)
    vat = money(sub * D(12) / D(112))
    sc = money(sub / D("1.12") * D("0.10"))
    total = sub + sc
    lines = ["KUSINA NI LOLA", "Maginhawa St., Quezon City", "VAT REG TIN 123-456-789-000", "", "Table 7   Guests 4",
             "Date: 10/04/2026  19:42", "--------------------------------"]
    for name, q, p in items:
        amt = money(D(p) * q)
        if q > 1:
            lines.append(f"{name}")
            lines.append(f"  {q} @ {fmt(p)}{fmt(amt):>18}")
        else:
            lines.append(f"{name:<22}{fmt(amt):>10}")
    lines += ["--------------------------------", f"{'SUBTOTAL':<22}{fmt(sub):>10}",
              f"{'Service Charge 10%':<22}{fmt(sc):>10}", f"{'TOTAL DUE':<22}{fmt(total):>10}", "",
              f"{'VATable Sales':<22}{fmt(sub - vat):>10}", f"{'VAT 12%':<22}{fmt(vat):>10}",
              f"{'CASH':<22}{fmt(3000):>10}", f"{'CHANGE':<22}{fmt(D(3000) - total):>10}", "", "Salamat po!"]
    exp = dict(merchant="KUSINA NI LOLA", date="2026-10-04", currency="PHP", subtotal=float(sub), tax=float(vat),
               taxInclusive=True, serviceCharge=float(sc), discount=None, tip=None, total=float(total),
               items=[dict(name=n, quantity=q, unitPrice=float(D(p)), totalPrice=float(money(D(p) * q))) for n, q, p in items])
    return Receipt("ph-restaurant", "KUSINA NI LOLA", "2026-10-04", "PHP", lines, exp,
                   "VAT-inclusive restaurant bill, 10% service charge, quantity lines, cash/change decoys")


def ph_fastfood():
    items = [("1pc Chickenjoy w/ Rice", 2, "99.00"), ("Jolly Spaghetti", 1, "70.00"), ("Peach Mango Pie", 3, "45.00"),
             ("Coke Float Regular", 2, "59.00")]
    sub = sum(money(D(p) * q) for _, q, p in items)
    vat = money(sub * D(12) / D(112))
    lines = ["SARAP GRILL EXPRESS", "SM North EDSA", "OR# 000184522", "10/06/2026 12:15 PM", "", "QTY ITEM              AMOUNT"]
    for name, q, p in items:
        lines.append(f"{q:<3} {name[:18]:<18}{fmt(money(D(p) * q)):>9}")
    lines += ["", f"{'Total':<22}{fmt(sub):>10}", f"{'Vatable':<22}{fmt(sub - vat):>10}", f"{'VAT Amount':<22}{fmt(vat):>10}",
              f"{'GCash':<22}{fmt(sub):>10}", "", "THIS SERVES AS AN OFFICIAL RECEIPT"]
    exp = dict(merchant="SARAP GRILL EXPRESS", date="2026-10-06", currency="PHP", subtotal=float(sub), tax=float(vat),
               taxInclusive=True, serviceCharge=None, discount=None, tip=None, total=float(sub),
               items=[dict(name=n, quantity=q, unitPrice=float(D(p)), totalPrice=float(money(D(p) * q))) for n, q, p in items])
    return Receipt("ph-fastfood", "SARAP GRILL EXPRESS", "2026-10-06", "PHP", lines, exp, "Quantity-first layout, inclusive VAT, e-wallet payment line")


def ph_discount():
    items = [("Beef Tapa", 1, "260.00"), ("Tocilog", 1, "220.00"), ("Brewed Coffee", 2, "90.00")]
    sub = sum(money(D(p) * q) for _, q, p in items)
    disc = money(sub * D("0.10"))
    total = sub - disc
    vat = money(total * D(12) / D(112))
    lines = ["CAFE BALAI", "Session Road, Baguio", "Date 2026-10-02", "", *[f"{n:<20}{q:>2}{fmt(money(D(p)*q)):>10}" for n, q, p in items],
             "", f"{'Subtotal':<22}{fmt(sub):>10}", f"{'Promo 10% off':<22}{'(' + fmt(disc) + ')':>10}",
             f"{'AMOUNT DUE':<22}{fmt(total):>10}", f"{'VAT 12% incl.':<22}{fmt(vat):>10}"]
    exp = dict(merchant="CAFE BALAI", date="2026-10-02", currency="PHP", subtotal=float(sub), tax=float(vat), taxInclusive=True,
               serviceCharge=None, discount=float(disc), tip=None, total=float(total),
               items=[dict(name=n, quantity=q, unitPrice=float(D(p)), totalPrice=float(money(D(p) * q))) for n, q, p in items])
    return Receipt("ph-discount", "CAFE BALAI", "2026-10-02", "PHP", lines, exp, "Promo discount in parentheses, inclusive VAT")


def ph_grocery_long():
    rng = random.Random(7)
    names = ["Rice 5kg", "Eggs Dozen", "Bear Brand 320g", "Lucky Me Pancit", "Sardines 155g", "Corned Beef", "Toyo 1L",
             "Suka 1L", "Garlic 250g", "Onion 500g", "Tomato 1kg", "Bananas", "Bread Loaf", "Peanut Butter", "Coffee 3in1 x30",
             "Sugar 1kg", "Cooking Oil 1L", "Dish Soap", "Shampoo Sachets", "Toothpaste", "Tissue 4 rolls", "Detergent 1kg",
             "Hotdog 1kg", "Chicken 1kg", "Pork Belly 500g", "Tilapia", "Kangkong", "Ampalaya", "Calamansi 250g", "Water 6L"]
    items = [(n, rng.choice([1, 1, 1, 2, 3]), f"{rng.randrange(25, 420)}.{rng.choice(['00','50','75','25'])}") for n in names]
    sub = sum(money(D(p) * q) for _, q, p in items)
    vat = money(sub * D(12) / D(112))
    lines = ["TINDAHAN MART", "Ortigas Ave, Pasig", "10/07/2026  18:03  POS 04", ""]
    for name, q, p in items:
        lines.append(f"{name[:20]:<20}{fmt(money(D(p) * q)):>12}")
        if q > 1:
            lines.append(f"  {q} x {fmt(p)}")
    lines += ["", f"{'TOTAL':<20}{fmt(sub):>12}", f"{'VAT (12%) incl':<20}{fmt(vat):>12}", f"{'ITEMS':<20}{sum(q for _, q, _ in items):>12}"]
    exp = dict(merchant="TINDAHAN MART", date="2026-10-07", currency="PHP", subtotal=float(sub), tax=float(vat), taxInclusive=True,
               serviceCharge=None, discount=None, tip=None, total=float(sub),
               items=[dict(name=n, quantity=q, unitPrice=float(D(p)), totalPrice=float(money(D(p) * q))) for n, q, p in items])
    return Receipt("ph-grocery-long", "TINDAHAN MART", "2026-10-07", "PHP", lines, exp, "30-line grocery receipt, quantity sub-lines")


def us_diner():
    items = [("Pastrami Sandwich", 1, "18.50"), ("Matzo Ball Soup", 2, "9.75"), ("Egg Cream", 2, "5.25")]
    sub = sum(money(D(p) * q) for _, q, p in items)
    tax = money(sub * D("0.08875"))
    total = sub + tax
    lines = ["CORNER BISTRO NYC", "331 W 4th St, New York", "Server: Dana  Table 12", "10/01/2026 1:24 PM", ""]
    for name, q, p in items:
        lines.append(f"{q} {name:<21}{fmt(money(D(p) * q)):>8}")
    lines += ["", f"{'Subtotal':<23}{fmt(sub):>9}", f"{'Sales Tax 8.875%':<23}{fmt(tax):>9}", f"{'Total':<23}{fmt(total):>9}", "",
              "Tip: ________", "Total: ________", "Thank you!"]
    exp = dict(merchant="CORNER BISTRO NYC", date="2026-10-01", currency="USD", subtotal=float(sub), tax=float(tax), taxInclusive=False,
               serviceCharge=None, discount=None, tip=None, total=float(total),
               items=[dict(name=n, quantity=q, unitPrice=float(D(p)), totalPrice=float(money(D(p) * q))) for n, q, p in items])
    return Receipt("us-diner", "CORNER BISTRO NYC", "2026-10-01", "USD", lines, exp, "Additive US sales tax, blank tip line")


def sg_kopi():
    items = [("Kaya Toast Set", 2, "6.80"), ("Kopi C", 2, "2.20"), ("Laksa", 1, "8.50")]
    sub = sum(money(D(p) * q) for _, q, p in items)
    sc = money(sub * D("0.10"))
    gst = money((sub + sc) * D("0.09"))
    total = sub + sc + gst
    lines = ["KOPI HOUSE", "Tiong Bahru, Singapore", "28/09/2026 09:12", ""]
    for name, q, p in items:
        lines.append(f"{name:<18}x{q}{fmt(money(D(p) * q)):>11}")
    lines += ["", f"{'Subtotal':<20}{fmt(sub):>11}", f"{'Svc Chg 10%':<20}{fmt(sc):>11}", f"{'GST 9%':<20}{fmt(gst):>11}",
              f"{'TOTAL SGD':<20}{fmt(total):>11}"]
    exp = dict(merchant="KOPI HOUSE", date="2026-09-28", currency="SGD", subtotal=float(sub), tax=float(gst), taxInclusive=False,
               serviceCharge=float(sc), discount=None, tip=None, total=float(total),
               items=[dict(name=n, quantity=q, unitPrice=float(D(p)), totalPrice=float(money(D(p) * q))) for n, q, p in items])
    return Receipt("sg-kopi", "KOPI HOUSE", "2026-09-28", "SGD", lines, exp, "Service charge plus additive GST, day-first date")


def render(receipt):
    font = ImageFont.truetype(FONT, 26)
    width = 34 * 16 + 80
    height = 70 + 36 * len(receipt.lines)
    img = Image.new("L", (width, height), 250)
    d = ImageDraw.Draw(img)
    y = 40
    for line in receipt.lines:
        d.text((40, y), line, fill=20, font=font)
        y += 36
    canvas = Image.new("L", (width + 240, height + 240), 120)
    canvas.paste(img, (120, 120))
    return canvas


def degrade(img, kind, seed):
    rng = random.Random(seed)
    if kind == "clean":
        return img
    if kind == "rotated":
        return img.rotate(rng.choice([-5, -3, 4, 6]), expand=True, fillcolor=120)
    if kind == "blurred":
        return img.filter(ImageFilter.GaussianBlur(1.6))
    if kind == "faded":
        faded = img.point(lambda v: 150 + v * 0.38)
        noise = Image.effect_noise(faded.size, 18)
        return Image.blend(faded, noise, 0.18)
    if kind == "lowres":
        small = img.resize((img.width * 45 // 100, img.height * 45 // 100))
        return small
    raise ValueError(kind)


def main():
    os.makedirs(EXPECTED, exist_ok=True)
    for receipt in [ph_restaurant(), ph_fastfood(), ph_discount(), ph_grocery_long(), us_diner(), sg_kopi()]:
        base = render(receipt)
        for kind in ["clean", "rotated", "blurred", "faded", "lowres"]:
            name = f"{receipt.rid}-{kind}.jpg"
            image = degrade(base, kind, zlib.crc32(name.encode())).convert("RGB")
            image.save(os.path.join(OUT, name), quality=35 if kind == "lowres" else 88)
            exp = dict(receipt.expected, image=name, notes=f"SYNTHETIC ({kind}). {receipt.notes}")
            with open(os.path.join(EXPECTED, name.replace(".jpg", ".json")), "w") as f:
                json.dump(exp, f, indent=2)
    print("wrote", len(os.listdir(EXPECTED)), "receipts to", OUT)


if __name__ == "__main__":
    main()
