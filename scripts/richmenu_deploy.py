# -*- coding: utf-8 -*-
"""
Rich Menu 上線：建立選單 → 上傳底圖 → 設為全體預設。純 urllib，不裝任何套件，讀 .env。

用法：
  py scripts/richmenu_deploy.py            預設 dry-run：只印出「將要建立什麼」，不動線上
  py scripts/richmenu_deploy.py --apply    真的執行（會先刪掉同名的舊選單）
  py scripts/richmenu_deploy.py --status   列出線上所有 rich menu 與目前預設

ACTIONS 的格數與順序必須和 richmenu_compose.py 的 MENUS 一致（左上到右下、先橫後直）。
message action 的 text 必須是 app.js 認得的指令字，否則按了不會有反應。
"""
import json
import os
import sys
import urllib.error
import urllib.request

sys.stdout.reconfigure(encoding="utf-8")

# ---------------- 可改區 ----------------
NAME = "main-v1"                       # 同名選單會在 --apply 時被砍掉重建
CHAT_BAR_TEXT = "開啟選單"              # 聊天室下方那條的文字（最多 14 字）
IMAGE = os.path.join("assets", "richmenu.jpg")
W, H, COLS, ROWS = 2500, 1686, 3, 2

ACTIONS = [
    {"type": "message", "label": "示範資料", "text": "示範資料"},
    {"type": "message", "label": "示範選單", "text": "示範選單"},
    {"type": "message", "label": "我的備註", "text": "我的備註"},
    {"type": "message", "label": "我的帳號", "text": "我的帳號"},
    {"type": "message", "label": "使用教學", "text": "使用教學"},
    {"type": "uri", "label": "官方網站", "uri": os.environ.get("PUBLIC_BASE_URL") or "https://line.me"},
]
# ---------------- 可改區結束 ----------------

API = "https://api.line.me/v2/bot"
API_DATA = "https://api-data.line.me/v2/bot"


def load_env(path=".env"):
    """極簡 .env 讀取；已存在的環境變數優先，不覆蓋。"""
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())


# 從專案根目錄執行，路徑才對得上
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
load_env()
TOKEN = os.environ.get("LINE_CHANNEL_ACCESS_TOKEN")
if not TOKEN:
    sys.exit("缺 LINE_CHANNEL_ACCESS_TOKEN：複製 docs/local-env.example 成 .env 並填值")
# uri action 要在讀完 .env 之後才定案
ACTIONS[-1]["uri"] = os.environ.get("PUBLIC_BASE_URL") or "https://line.me"


def rich_menu_body():
    if len(ACTIONS) != COLS * ROWS:
        sys.exit(f"ACTIONS 有 {len(ACTIONS)} 個，版面是 {COLS}x{ROWS}，請一致")
    cell_w, cell_h = W // COLS, H // ROWS
    areas = []
    for i, action in enumerate(ACTIONS):
        row, col = divmod(i, COLS)
        areas.append({"bounds": {"x": col * cell_w, "y": row * cell_h, "width": cell_w, "height": cell_h}, "action": action})
    return {"size": {"width": W, "height": H}, "selected": True, "name": NAME, "chatBarText": CHAT_BAR_TEXT, "areas": areas}


def call(method, url, data=None, content_type="application/json"):
    body = None
    headers = {"Authorization": f"Bearer {TOKEN}"}
    if data is not None:
        body = json.dumps(data).encode("utf-8") if isinstance(data, (dict, list)) else data
        headers["Content-Type"] = content_type
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            txt = r.read().decode("utf-8")
            return r.status, (json.loads(txt) if txt else {})
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")


def status():
    code, lst = call("GET", f"{API}/richmenu/list")
    print("rich menu 清單:", code)
    for m in (lst.get("richmenus", []) if isinstance(lst, dict) else []):
        print(" -", m["richMenuId"], m["name"], m["chatBarText"], len(m["areas"]), "areas")
    code, default = call("GET", f"{API}/user/all/richmenu")
    print("目前預設:", code, default)


def apply():
    if not os.path.exists(IMAGE):
        sys.exit(f"找不到 {IMAGE}，先跑：py scripts/richmenu_compose.py")
    size = os.path.getsize(IMAGE)
    if size > 1_000_000:
        sys.exit(f"{IMAGE} 有 {size/1024:.0f}KB，超過 LINE 的 1MB 限制")

    code, lst = call("GET", f"{API}/richmenu/list")
    for m in (lst.get("richmenus", []) if isinstance(lst, dict) else []):
        if m["name"] == NAME:
            print("刪除同名舊選單", m["richMenuId"], call("DELETE", f"{API}/richmenu/{m['richMenuId']}")[0])

    code, created = call("POST", f"{API}/richmenu", rich_menu_body())
    print("建立:", code, created)
    if code != 200:
        sys.exit("建立失敗：檢查 areas 座標是否超出 size、label 是否超過 20 字")
    rid = created["richMenuId"]

    with open(IMAGE, "rb") as f:
        img = f.read()
    code, resp = call("POST", f"{API_DATA}/richmenu/{rid}/content", img, "image/jpeg")
    print("上傳底圖:", code, resp)
    if code != 200:
        sys.exit("上傳失敗：圖片必須是 JPEG/PNG、2500x1686 或 2500x843、且 ≤1MB")

    code, resp = call("POST", f"{API}/user/all/richmenu/{rid}")
    print("設為預設:", code, resp)
    if code != 200:
        sys.exit("設定預設失敗")
    print("RICH_MENU_ID =", rid)
    print("提醒：Rich Menu 只在手機版顯示，桌機版看不到；示範一律用手機。")


if __name__ == "__main__":
    if "--status" in sys.argv:
        status()
    elif "--apply" in sys.argv:
        apply()
        status()
    else:
        print("dry-run（沒有 --apply，不會動到線上任何東西）。將建立：")
        print(json.dumps(rich_menu_body(), ensure_ascii=False, indent=1))
        print(f"\n底圖：{IMAGE}（{'存在' if os.path.exists(IMAGE) else '不存在 → 先跑 richmenu_compose.py'}）")
        print("確認無誤後加 --apply 真的執行")
