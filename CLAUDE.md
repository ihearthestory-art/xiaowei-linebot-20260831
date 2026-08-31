# xiaowei-restaurant-line-bot

> 由 line-bot-kit 於 2026-08-28 建立。開發規程見 skill `line-bot-kit`（~/.claude/skills/line-bot-kit）。

## 本專案資訊（邊做邊填）
- LINE 官方帳號：@______（`npm run admin -- info` 可查）
- Rich Menu id：richmenu-______
- Zeabur project id：______
- Zeabur service id：______（首次 `npx zeabur@latest deploy --project-id <PID>` 後產生）
- 部署網域：https://______.zeabur.app
- GitHub：https://github.com/eliajhmauve/xiaowei-restaurant-line-bot（Template repository，學生用 Use this template 複製）
- 部署指令：`npx zeabur@latest deploy --project-id <PID> --service-id <SID> -i=false --json`
- 環境變數名（值在 .env／Zeabur，勿入庫）：LINE_CHANNEL_SECRET、LINE_CHANNEL_ACCESS_TOKEN、PUBLIC_BASE_URL、ADMIN_USER_IDS、DATA_DIR

## 待補
- [ ] 填 .env 的 LINE secret／token → `npm run admin -- info` 驗證
- [ ] 改 src/views.js、src/seed/stores.json 成本專案內容
- [ ] Rich Menu：`python scripts/richmenu_compose.py` → `python scripts/richmenu_deploy.py --apply`
- [ ] 部署 + `node scripts/bootstrap.mjs --webhook https://<域>/webhook`
- [ ] Zeabur 掛 volume 到 /app/data

---

# LINE Bot 範本 — 給接手 AI 的說明

這是與業務無關的 LINE bot 骨架。複製整個資料夾當新專案，改 `src/views.js`（卡片）＋`src/app.js`（路由）就是一支新的 bot。
**改業務邏輯前先把 `npm test` 跑綠**，確認骨架在你的環境是通的。

## 目錄

```
src/server.js          Express 入口：/webhook（驗簽 + 先回 200）、/healthz、/assets 靜態檔
src/config.js          env 讀取與 fail-fast；LINE_CHANNEL_SECRET=test 進測試模式
src/db.js              node:sqlite：bindings / pending（10 分鐘過期）/ kv（示範用）
src/line/client.js     LINE API 純 fetch 封裝：reply/push/showLoading/getContent/webhook/richmenu/quota
src/line/cards.js      Flex 原子元件 + 色票 T（換配色只改 T）
src/views.js           所有卡片；MAIN_RAIL 是每則訊息底部的快捷列
src/app.js             事件路由：follow / text / image / postback
src/seed/stores.json   示範帳號與開通碼（換成你的資料來源）
catalog.config.mjs     功能總覽要展示哪些卡、怎麼分類
scripts/               preflight / bootstrap / line-admin / render-catalog / richmenu_*.py
tests/fake-line.mjs    假 LINE client 跑完整流程；npm test 就是跑它
assets/hero/           Flex hero 圖，走 PUBLIC_BASE_URL/assets/hero/*.jpg
```

## 加一張卡（改 views.js）

1. 在 `src/views.js` 的 `V` 裡加一個函式，用 `cards.js` 的元件組，最後用 `flex(altText, shell({...}), MAIN_RAIL)` 包起來。
2. 顏色一律用 `T.*`，不要寫死色碼；每個 text 都要給 color（LINE 不會自動處理深色模式）。
3. 最後一則訊息掛 `MAIN_RAIL`，使用者才有快捷列可以按。
4. 到 `catalog.config.mjs` 的 `sections` 加一筆，`npm run catalog` 就會出現在總覽 PDF 上。

```js
myCard(store, data) {
  return flex(`標題｜${data.status}`, shell({
    title: "標題", subtitle: store.name,
    contents: [kvRow("欄位", data.value), separator(), pillRow([pill(data.status, "pos")])],
    footer: [btnRow([btn("動作", `ns:action:${data.id}`, { primary: true })])],
  }), MAIN_RAIL);
}
```

## 加一個指令（改 app.js）

**文字指令**：把字加進檔案上方的 `MENU_WORDS`，再到 `onText` 的 `switch` 加一個 `case`。
（`MENU_WORDS` 的作用：一問一答進行中時，這些字視同放棄回答，不會被當成答案吃掉。）

**按鈕動作**：在卡片用 `btn("標籤", "ns:action:arg")`，再到 `onPostback` 依 `ns` 分流。
`data` 一律用 `ns:action:arg` 三段式，同一個 ns 的動作寫在同一個 if 區塊裡。

**一問一答**：先 `db.setPending(userId, "模式名", { …參數 })` 再回提問卡；下一則文字在 `onText` 的 pending 區塊處理完要 `db.clearPending(userId)`。10 分鐘沒回答自動失效。

**新的資料表**：加在 `src/db.js` 的 `db.exec` 裡，方法掛在同一個回傳物件上，不要在別的檔案直接開 SQLite。

## 跑起來與測試

```bash
npm install
npm run preflight              # 檢查 node/npm/CLI/Chrome/Python/.env，有 ❌ 先修
cp docs/local-env.example .env # 填 LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN
npm test                       # 假 client 跑 follow→開通→選單→postback→圖片，不需要真憑證
npm run dev                    # 本機起服務（讀 .env、存檔自動重啟）
npm run catalog                # 產 docs/catalog.html + catalog.pdf（要 Chrome）
```

Node 22 跑 `start`/`test` 要加 `--experimental-sqlite`；Node 24 不用（Dockerfile 已用 node:24）。

## 上線

```bash
node scripts/bootstrap.mjs --zeabur-service <SERVICE_ID> --webhook https://<你的網域>/webhook
npm run admin -- info                       # 驗 token
npm run admin -- webhook test               # 確認 LINE 打得到
py scripts/richmenu_compose.py              # 出 assets/richmenu.jpg
py scripts/richmenu_deploy.py               # dry-run
py scripts/richmenu_deploy.py --apply       # 真的上選單
```

部署指令（把 `<PROJECT_ID>` / `<SERVICE_ID>` 換成這個專案的，第一次部署後回填到這裡）：

```bash
npx zeabur@latest deploy --project-id <PROJECT_ID> --service-id <SERVICE_ID> --json
npx zeabur@latest variable update --id <SERVICE_ID> -k KEY=VALUE -y -i=false
```

- Project ID：`<PROJECT_ID>`
- Service ID：`<SERVICE_ID>`
- Domain：`<https://…>`（webhook = 網域 + `/webhook`）
- 資料要保留就把 volume 掛到 `/app/data`，否則每次部署 SQLite 會重置

## 不要踩的坑

- webhook 一定要先驗簽再 `JSON.parse`：簽章是對 raw bytes 算的，先 parse 再 stringify 會驗不過
- 一定要先回 200 再處理事件；LINE Verify 按鈕送的是 `events: []`，也要回 200
- reply token 只能用一次、約 1 分鐘過期 → 一律走 `safeReply`（失敗自動退回 push）
- Flex 的 box 沒有 `wrap` 屬性；每個 text 都要顯式給 color
- 按鈕 label ≤ 20 字、altText ≤ 400 字，超過整則訊息會被退件（`cards.js` 已自動截斷）
- Rich Menu 底圖必須 ≤ 1MB、2500×1686 或 2500×843，且只有手機版會顯示
- 憑證只進 `.env` 與部署平台變數，不要印在 log 或寫進任何文件
