# LINE Bot 範本

## 一鍵部署到你自己的 Cloudflare（推薦，全程瀏覽器）

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/eliajhmauve/xiaowei-restaurant-line-bot)

按下去之後，Cloudflare 會：把這個 repo 複製到**你自己的 GitHub**、自動建立你自己的
D1 資料庫並綁好、部署到**你自己的 Cloudflare 帳號**，最後給你一個 `xxx.workers.dev` 網址。
不用裝任何程式、不用打指令、不用信用卡。

部署完成後：

1. 開 `https://你的網址/join`，填課程通行碼、代號、店名，貼上你自己的
   LINE Channel secret 與 access token
2. 頁面會給你一串 **Webhook 網址**，複製回 LINE 後台（設定 → Messaging API）
3. LINE 後台 → 回應設定：**Webhook 開、自動回應訊息 關**
4. 用手機加好友，傳「營業時間」試試看
5. 之後想改店名、營業時間、菜單，開 `https://你的網址/me/你的代號`

部署頁不要求 token，並不是省略接線：它只建立 Worker 與 D1。下一步 `/join` 才要由學生親手貼自己的 LINE Channel secret 與 access token，理解憑證、Webhook 與店家資料的關係，也避免把憑證混進共用的部署設定。

### 為什麼用 Cloudflare 而不是別的

| | Render 免費 | **Cloudflare Workers 免費** |
|---|---|---|
| 休眠 | 閒置 15 分鐘睡著，喚醒約 1 分鐘 | **不休眠**，冷啟動約 5 毫秒 |
| 資料 | SQLite 在休眠時被清空 | **D1 免費 5GB，永久保存** |
| 用量 | 750 小時/月（全帳號共用） | **每天 10 萬次請求** |
| 信用卡 | 不用 | 不用 |

LINE 規定 webhook 要在 **2 秒內**回應。實測這支 Worker 的回應時間是 **5–10 毫秒**。


## 學生各自部署

這個專案應作為 GitHub Template Repository 使用。每位學生都要建立自己的 Repo、LINE Channel、Zeabur service 與環境變數，不能共用老師的帳號或 `.env`。完整流程見 [學生部署指南](docs/STUDENT_DEPLOY.md)。

可直接複製起新專案的 LINE Messaging API 骨架：Express webhook、Flex 卡片元件庫、內建 SQLite、
以及上線要用的腳本（前置檢查、一鍵設定、Rich Menu 出圖與部署、功能總覽 PDF）。

內含餐館情境的可運作範例：店家 FAQ、三步訂位需求、真人客服與回饋分流；學生可依自己的店家資料修改。

AI 是選配，不是 Bot 的單點故障。每位學生可用自己的 Gemini Free Tier API key 啟用「一般問題的 AI fallback」；沒有 key 時，FAQ、訂位與真人客服仍可完整運作。完整取得與安全設定步驟見 [學生部署指南](docs/STUDENT_DEPLOY.md#選做取得你自己的免費-gemini-api-key3-分鐘)。

## 5 分鐘上手

```bash
npm install
npm test            # 不用任何憑證，假 LINE client 跑完整流程
```

看到 `pass 10`、`fail 0` 就代表目前範例在你的環境跑得起來。接著：

```bash
cp docs/local-env.example .env
# 到 LINE Developers Console 建 Messaging API channel，把 secret 與 access token 填進 .env
npm run preflight   # 檢查工具鏈與 .env，有 ❌ 先修
npm run dev         # 本機 http://localhost:3000/healthz 應該回 {"ok":true,…}
```

本機沒有公開網址，webhook 收不到 LINE 的請求。部署到有 https 網域的地方之後：

```bash
node scripts/bootstrap.mjs --webhook https://你的網域/webhook
```

它會驗 token、設 webhook、叫 LINE 打一次確認通不通，最後印出還要人工做的檢查表。

## 這支 bot 現在會做什麼

| 你做的事 | bot 的反應 |
|---|---|
| 加好友 | 餐館歡迎卡與可用功能 |
| 打「營業時間」／「怎麼去」 | 僅回覆已確認的店家資料 |
| 打「菜單」 | 顯示示範菜單與過敏原轉人工入口 |
| 打「訂位」 | 依序收集時間、人數、稱呼，建立待確認案件 |
| 打「真人客服」 | 建立一張人工處理案件，下一句補上問題 |
| 打「給建議」 | 收集回饋；負面緊急字詞標優先處理 |
| 傳一張圖 | 提醒轉由真人確認，不自行判讀 |
| 規則沒有命中的一般問題（選配） | 以自己 Gemini key 回答已確認店家資料；個資、訂位、過敏原、客訴一律轉真人 |

## 常用指令

| 指令 | 做什麼 |
|---|---|
| `npm run dev` | 本機起服務，存檔自動重啟 |
| `npm test` | 假 client 跑完整對話流程 |
| `npm run preflight` | 檢查 Node／CLI／Chrome／Python／.env |
| `npm run catalog` | 產 `docs/catalog.html` + `catalog.pdf` 功能總覽（交付用） |
| `npm run admin -- info` | 驗 access token 有沒有效 |
| `npm run admin -- webhook set <url>` | 設定 webhook |
| `npm run admin -- richmenu list` | 看線上的圖文選單 |
| `npm run admin -- quota` | 看本月 push 額度 |
| `py scripts/richmenu_compose.py` | 產 `assets/richmenu.jpg` 六格選單底圖 |
| `py scripts/richmenu_deploy.py --apply` | 上傳選單並設為預設 |

## 環境需求

- Node 24（Node 22 也行，但 `node:sqlite` 要加 `--experimental-sqlite`）
- Chrome（只有 `npm run catalog` 產 PDF 需要，可用 `CHROME_PATH` 指定路徑）
- Python 3 + Pillow（只有 `richmenu_compose.py` 出圖需要）

## 要改的地方

改卡片看 `src/views.js`，改流程看 `src/app.js`，改配色看 `src/line/cards.js` 最上面的 `T`。
完整說明在 [CLAUDE.md](CLAUDE.md)。
