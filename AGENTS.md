# AGENTS.md — 給自動化 agent 的守則

## 安燈線（遇到就停下回報，不要自行決定）
1. 要改介面／資料結構／模組邊界（例如改既有路由路徑、改 tenants 既有欄位、改 createApp 簽名）→ 停下，在回報裡寫「NEED-DECISION」＋理由。
2. 遇到破壞性指令需求（刪檔、覆蓋未版控檔案、git push/force）→ 停線回報。
3. 測試跑不起來或跑不過 → 誠實回報「不能宣稱通過」，不得造假。

## Redlines（絕不）
- 不碰 `.env`、`.env.*`、任何憑證；不把 token/secret 寫進任何檔案
- 不執行 `git commit` / `git push`（由人審過後提交）
- 不刪既有路由、不改既有路由路徑
- schema 只加表／加欄位，不改不刪既有欄位

## 架構事實（省你摸索）
- Production 跑在 Cloudflare Workers：入口 `worker/index.js`，對話邏輯 `worker/app.js`（worker 版）＋ `src/`（views、enroll 表單 HTML、export CSV）。本機 Node 版（`src/server.js`）是教學遺留，非主線。
- 測試：`npm test`（假 LINE client，不需憑證，不需網路）。目前 13/13 過，交付時必須全過。
- D1 免費層有單列大小上限，BLOB 存圖每張壓在 900KB 以下。
- 圖文選單圖規格（LINE 官方）：JPEG/PNG、寬 800–2500、高 ≥250、寬高比 ≥1.45、≤1MB。

## 回報格式
- `VERDICT: PASS|FAIL` ＋編號列出做了什麼
- 每項附 file:line
- 測試輸出原文貼最後幾行（pass/fail 數字）
- 沒做完的明說，不包裝
