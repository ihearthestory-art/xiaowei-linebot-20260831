# -*- coding: utf-8 -*-
"""產生預設的六格圖文選單底圖（2500×1686 JPEG，LINE 規定的尺寸）。

為什麼要有這支：
  原本的教法是叫學員在 LINE 後台一格一格手畫、手填，70 個人平均要 15 分鐘，
  而且畫出來的東西沒有一個是可以用的。改成程式一鍵生成之後，學員按一個按鈕
  就在自己手機上看到選單，省下的時間拿去做真正重要的事。

為什麼不用 AI 產圖：
  AI 產圖每次結果不一樣、字會歪、要等額度。這張圖的內容是固定的六個功能，
  用幾何圖形畫反而更準、更快、離線可跑，而且跟簡報同一套視覺語言
  （田中一光×瑞士方格：純色塊、圓與方、不用漸層不用陰影）。

跑法：
  py -3 tools/make_richmenu_image.py
  → assets/richmenu-default.jpg（必須 <1MB，LINE 的上限）
"""
import os
from PIL import Image, ImageDraw, ImageFont

W, H = 2500, 1686           # LINE 圖文選單的標準大尺寸
COLS, ROWS = 3, 2
CW, CH = W // COLS, H // ROWS   # 833 × 843

PAPER = (244, 241, 234)     # #F4F1EA 紙
INK = (26, 26, 26)          # #1A1A1A 墨
GREEN = (6, 199, 85)        # #06C755 LINE 綠
VERMILION = (232, 93, 44)   # #E85D2C 朱
BLUE = (27, 77, 143)        # #1B4D8F 藍
GREY = (122, 122, 122)
HAIRLINE = (222, 216, 202)

# 六格：標題、副標、主色、圖示代號。順序＝手機上由左到右、由上到下。
# 標題文字必須跟 src/app.js 的 MENU_WORDS 完全一致，點下去 bot 才認得。
CELLS = [
    ("菜單",     "有什麼、多少錢",  GREEN,     "menu"),
    ("營業時間", "今天開不開",      INK,       "clock"),
    ("怎麼去",   "地址與地圖",      BLUE,      "pin"),
    ("訂位",     "哪天、幾位",      INK,       "calendar"),
    ("使用說明", "這裡能問什麼",    GREY,      "bubble"),
    ("真人客服", "找老闆本人",      VERMILION, "person"),
]


def font(size, bold=True):
    """優先用微軟正黑體：Windows 一定有，粗體是獨立檔案，不必猜變體軸。"""
    for path in ([r"C:\Windows\Fonts\msjhbd.ttc"] if bold else []) + [
            r"C:\Windows\Fonts\msjh.ttc",
            r"C:\Windows\Fonts\NotoSansTC-VF.ttf"]:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    raise SystemExit("找不到中文字型，請改 font() 裡的路徑")


def centered(d, text, cx, y, f, fill):
    x0, y0, x1, y1 = d.textbbox((0, 0), text, font=f)
    d.text((cx - (x1 - x0) / 2 - x0, y - y0), text, font=f, fill=fill)
    return y1 - y0


def icon(d, kind, cx, cy, color):
    """圖示一律用圓、方、三角這三種基本形，線寬統一 14px。

    刻意不用 emoji、不用圖示字型：emoji 在不同手機上長得不一樣，
    圖示字型要多帶一個檔案。幾何圖形在哪裡都一模一樣。
    """
    r, lw = 96, 14
    if kind == "menu":                     # 三條橫線＝菜單
        for i, w in enumerate((r * 2, r * 2, r * 1.3)):
            y = cy - r * 0.55 + i * r * 0.55
            d.rounded_rectangle([cx - w / 2, y - lw / 2, cx + w / 2, y + lw / 2],
                                radius=lw / 2, fill=color)
    elif kind == "clock":                  # 圓＋兩根針＝時間
        d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=color, width=lw)
        d.line([cx, cy, cx, cy - r * 0.55], fill=color, width=lw)
        d.line([cx, cy, cx + r * 0.45, cy], fill=color, width=lw)
    elif kind == "pin":                    # 水滴＋圓孔＝地圖圖釘
        d.ellipse([cx - r * 0.78, cy - r, cx + r * 0.78, cy + r * 0.56],
                  outline=color, width=lw)
        d.polygon([(cx - r * 0.38, cy + r * 0.34), (cx + r * 0.38, cy + r * 0.34),
                   (cx, cy + r * 1.05)], fill=color)
        d.ellipse([cx - r * 0.26, cy - r * 0.38, cx + r * 0.26, cy + r * 0.14],
                  fill=PAPER)
    elif kind == "calendar":               # 方框＋頂條＋圓點＝日曆
        d.rounded_rectangle([cx - r * 0.9, cy - r * 0.8, cx + r * 0.9, cy + r * 0.9],
                            radius=18, outline=color, width=lw)
        d.rectangle([cx - r * 0.9, cy - r * 0.8, cx + r * 0.9, cy - r * 0.38], fill=color)
        for gx in (-0.42, 0.0, 0.42):
            for gy in (0.12, 0.55):
                d.ellipse([cx + r * gx - 11, cy + r * gy - 11,
                           cx + r * gx + 11, cy + r * gy + 11], fill=color)
    elif kind == "bubble":                 # 圓角框＋尾巴＝對話框
        d.rounded_rectangle([cx - r * 0.95, cy - r * 0.75, cx + r * 0.95, cy + r * 0.45],
                            radius=30, outline=color, width=lw)
        d.polygon([(cx - r * 0.3, cy + r * 0.45), (cx - r * 0.02, cy + r * 0.45),
                   (cx - r * 0.28, cy + r * 0.95)], fill=color)
        for gx in (-0.4, 0.0, 0.4):
            d.ellipse([cx + r * gx - 12, cy - r * 0.2 - 12,
                       cx + r * gx + 12, cy - r * 0.2 + 12], fill=color)
    elif kind == "person":                 # 圓頭＋半圓肩＝人
        d.ellipse([cx - r * 0.42, cy - r * 0.86, cx + r * 0.42, cy - r * 0.02],
                  outline=color, width=lw)
        d.arc([cx - r * 0.86, cy + r * 0.06, cx + r * 0.86, cy + r * 1.6],
              start=180, end=360, fill=color, width=lw)


def build():
    img = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(img)
    f_title, f_sub = font(78, True), font(42, False)

    for i, (title, sub, color, kind) in enumerate(CELLS):
        col, row = i % COLS, i // COLS
        x0, y0 = col * CW, row * CH
        cx = x0 + CW / 2

        # 格線：細髮線就好。LINE 已經會在格子之間顯示按壓效果，不需要重畫邊框。
        if col:
            d.rectangle([x0 - 2, y0 + 40, x0 + 2, y0 + CH - 40], fill=HAIRLINE)
        if row:
            d.rectangle([x0 + 40, y0 - 2, x0 + CW - 40, y0 + 2], fill=HAIRLINE)

        # 主色條：每格頂端一條，讓六格在手機上一眼分得出來
        d.rectangle([x0 + 90, y0 + 74, x0 + CW - 90, y0 + 84], fill=color)

        icon(d, kind, cx, y0 + CH * 0.42, color)
        centered(d, title, cx, y0 + CH * 0.66, f_title, INK)
        centered(d, sub, cx, y0 + CH * 0.66 + 108, f_sub, GREY)

    out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                       "assets", "richmenu-default.jpg")
    img.save(out, "JPEG", quality=88, optimize=True)
    size = os.path.getsize(out)
    print(f"{out}  {size/1024:.0f} KB  {W}x{H}")
    if size > 1024 * 1024:
        raise SystemExit("超過 LINE 的 1MB 上限，把 quality 調低再跑一次")


if __name__ == "__main__":
    build()
