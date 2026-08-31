# -*- coding: utf-8 -*-
"""
Rich Menu 出圖（純 Pillow，不靠 AI 產圖）：2500x1686、2x3 六格、配色對齊 cards.js 的色票。

用法：py scripts/richmenu_compose.py  →  輸出 assets/richmenu.jpg（自動壓到 <1MB）

改選單只動下面的 MENUS 常數（文字／副標／圖示）；顏色改 PALETTE。
richmenu_deploy.py 裡有一份對應的 ACTIONS，兩邊格數與順序必須一致，改一邊要改兩邊。
之後若要換成設計師或 AI 產的圖，直接把 assets/richmenu.jpg 覆蓋掉再跑 deploy 即可。
"""
import io
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

sys.stdout.reconfigure(encoding="utf-8")

# ---------------- 可改區 ----------------
MENUS = [
    ("示範資料", "看一張標準資訊卡", "card"),
    ("示範選單", "postback 按鈕分流", "grid"),
    ("我的備註", "一問一答存下的東西", "note"),
    ("我的帳號", "綁定狀態與 userId", "user"),
    ("使用教學", "三分鐘上手", "book"),
    ("官方網站", "開啟外部連結", "link"),
]

PALETTE = {
    "bg": (31, 58, 95),      # #1F3A5F 卡片外底
    "card": (247, 248, 250),  # #F7F8FA 格子底
    "ink": (27, 36, 48),      # #1B2430 標題字
    "sub": (107, 118, 132),   # #6B7684 副標字
    "main": (46, 111, 183),   # #2E6FB7 圖示主色
    "accent": (201, 146, 42),  # #C9922A 首格強調條
}

W, H = 2500, 1686
COLS, ROWS = 3, 2
# 底部安全留白：部分機型／輸入法會蓋住選單最下緣，這段不放文字與圖示
SAFE_BOTTOM = 90
MAX_BYTES = 980_000  # LINE 限制 1MB，留一點餘裕
OUT = os.path.join("assets", "richmenu.jpg")

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\msjhbd.ttc",
    r"C:\Windows\Fonts\msjh.ttc",
    "/System/Library/Fonts/PingFang.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc",
]
# ---------------- 可改區結束 ----------------


def font(size):
    """找得到中文字型就用，找不到退回 PIL 內建點陣字（中文會變方框，但不會整支掛掉）。"""
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size, index=0)
            except Exception:
                continue
    print("⚠ 找不到中文字型，改用內建字型（中文會顯示為方框）。修法：裝 Noto Sans CJK 或把字型路徑加進 FONT_CANDIDATES")
    return ImageFont.load_default()


def draw_icon(d, kind, cx, cy, r, color):
    """用幾何圖形畫圖示，不依賴任何圖檔或字型。"""
    lw = max(6, r // 6)
    if kind == "card":
        d.rounded_rectangle([cx - r, cy - r * 0.7, cx + r, cy + r * 0.7], radius=r * 0.2, outline=color, width=lw)
        for i in range(3):
            y = cy - r * 0.3 + i * r * 0.35
            d.line([cx - r * 0.6, y, cx + r * 0.6 - i * r * 0.3, y], fill=color, width=lw // 2)
    elif kind == "grid":
        for gx in range(2):
            for gy in range(2):
                x0 = cx - r + gx * r * 1.05
                y0 = cy - r * 0.8 + gy * r * 0.95
                d.rounded_rectangle([x0, y0, x0 + r * 0.85, y0 + r * 0.75], radius=r * 0.15, fill=color if gx == gy else None, outline=color, width=lw // 2)
    elif kind == "note":
        d.rounded_rectangle([cx - r * 0.8, cy - r * 0.9, cx + r * 0.8, cy + r * 0.9], radius=r * 0.18, outline=color, width=lw)
        for i in range(3):
            y = cy - r * 0.4 + i * r * 0.42
            d.line([cx - r * 0.45, y, cx + r * 0.45, y], fill=color, width=lw // 2)
    elif kind == "user":
        d.ellipse([cx - r * 0.45, cy - r * 0.85, cx + r * 0.45, cy + r * 0.05], outline=color, width=lw)
        d.arc([cx - r * 0.85, cy - r * 0.05, cx + r * 0.85, cy + r * 1.5], start=180, end=360, fill=color, width=lw)
    elif kind == "book":
        d.rounded_rectangle([cx - r, cy - r * 0.8, cx - r * 0.05, cy + r * 0.8], radius=r * 0.1, outline=color, width=lw)
        d.rounded_rectangle([cx + r * 0.05, cy - r * 0.8, cx + r, cy + r * 0.8], radius=r * 0.1, outline=color, width=lw)
        for i in range(3):
            y = cy - r * 0.4 + i * r * 0.35
            d.line([cx - r * 0.8, y, cx - r * 0.25, y], fill=color, width=lw // 2)
            d.line([cx + r * 0.25, y, cx + r * 0.8, y], fill=color, width=lw // 2)
    elif kind == "link":
        d.rounded_rectangle([cx - r, cy - r * 0.7, cx + r, cy + r * 0.7], radius=r * 0.15, outline=color, width=lw)
        d.line([cx - r, cy - r * 0.35, cx + r, cy - r * 0.35], fill=color, width=lw)
        d.line([cx - r * 0.55, cy + r * 0.05, cx + r * 0.55, cy + r * 0.05], fill=color, width=lw // 2)
        d.line([cx - r * 0.55, cy + r * 0.35, cx + r * 0.2, cy + r * 0.35], fill=color, width=lw // 2)


def compose():
    if len(MENUS) != COLS * ROWS:
        sys.exit(f"MENUS 有 {len(MENUS)} 格，但版面是 {COLS}x{ROWS}={COLS * ROWS} 格，請一致")

    img = Image.new("RGB", (W, H), PALETTE["bg"])
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 6], fill=PALETTE["accent"])  # 頂部細帶

    pad, gap = 44, 34
    cw = (W - pad * 2 - gap * (COLS - 1)) // COLS
    ch = (H - pad * 2 - SAFE_BOTTOM - gap * (ROWS - 1)) // ROWS
    f_title = font(88)
    f_sub = font(44)

    for idx, (title, sub, icon) in enumerate(MENUS):
        row, col = divmod(idx, COLS)
        x0 = pad + col * (cw + gap)
        y0 = pad + row * (ch + gap)

        shadow = Image.new("RGBA", (cw + 40, ch + 40), (0, 0, 0, 0))
        ImageDraw.Draw(shadow).rounded_rectangle([20, 26, cw + 20, ch + 26], radius=52, fill=(0, 0, 0, 90))
        img.paste(shadow.filter(ImageFilter.GaussianBlur(18)), (x0 - 20, y0 - 20), shadow.filter(ImageFilter.GaussianBlur(18)))
        d = ImageDraw.Draw(img)

        d.rounded_rectangle([x0, y0, x0 + cw, y0 + ch], radius=52, fill=PALETTE["card"] if idx else (232, 240, 249))
        if idx == 0:
            d.rounded_rectangle([x0 + 60, y0, x0 + cw - 60, y0 + 12], radius=6, fill=PALETTE["accent"])

        draw_icon(d, icon, x0 + cw // 2, y0 + ch * 0.34, 118, PALETTE["main"] if idx != len(MENUS) - 1 else PALETTE["sub"])
        tw = d.textlength(title, font=f_title)
        d.text((x0 + (cw - tw) / 2, y0 + ch * 0.58), title, font=f_title, fill=PALETTE["ink"])
        sw = d.textlength(sub, font=f_sub)
        d.text((x0 + (cw - sw) / 2, y0 + ch * 0.58 + 118), sub, font=f_sub, fill=PALETTE["sub"])

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    quality = 92
    while True:
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=quality, optimize=True)
        if buf.tell() < MAX_BYTES or quality <= 60:
            break
        quality -= 4
    with open(OUT, "wb") as f:
        f.write(buf.getvalue())
    print(f"寫出 {OUT}  {buf.tell() / 1024:.0f}KB  quality={quality}  {W}x{H}")
    if buf.tell() >= 1_000_000:
        print("⚠ 仍然超過 1MB，LINE 會拒收：把圖片簡化或再降 quality")


if __name__ == "__main__":
    compose()
