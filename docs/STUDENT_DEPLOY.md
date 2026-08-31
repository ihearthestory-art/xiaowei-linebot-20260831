# 學生版：把自己的 LINE 餐館 Bot 部署到 Zeabur

這份流程的目標是：**每位學生都有自己的 Bot、自己的 LINE 憑證、自己的 Zeabur 網址。** 不共用老師的 `.env`、LINE Channel 或 Zeabur 服務。

## 全流程

```text
複製課程模板 Repo → 建自己的 LINE Channel → 填自己的環境變數
→ Zeabur 從自己的 GitHub Repo 部署 → Webhook 指向自己的網址
```

## 開始前

- 你自己的 GitHub、Zeabur、LINE Official Account 帳號。
- 本機已安裝 Node.js 22 以上與 Git。
- 不要將 token、Channel secret、Cookie 傳給老師、同學或 AI。

## 費用規則（課程預設）

- 本課程只要求短期 Demo，先使用 Zeabur **Free Plan**，不需要為了上課先付費。
- 若 Zeabur 顯示 14 天 Dev／Pro 試用，**不是課程必要步驟**；除非你自己想試，否則不要開啟。
- 試用期結束可能自動續訂付費方案；若學生自行開啟試用，必須自行在到期前取消或降回 Free Plan。
- 要長期維持、使用更多資源或避免免費額度限制，才由學生自行決定是否升級。

Zeabur 說明其 Free Plan 可免費嘗試與部署服務；付費試用為 14 天，若不想續費須在結束前取消。 [Free Plan FAQ](https://zeabur.com/docs/en-US/get-started/faq-support)／[訂閱與試用說明](https://zeabur.com/docs/en-US/subscription)

## 選做：取得你自己的免費 Gemini API key（3 分鐘）

這一步不是必做。**不填 key，Bot 仍可用 FAQ、訂位與真人客服。** 填好後，只有規則沒命中的一般問題才會交給 AI；訂位、過敏原、客訴、付款與個資仍會轉真人。

1. 用自己的 Google 帳號開啟 [Google AI Studio](https://aistudio.google.com/app/apikey)。
2. 在 **API Keys** 頁面按 **Create API key**。若你剛登入，AI Studio 可能已先建立一把可用 key；請確認它屬於你自己的 Project。
3. 選擇或建立自己的 Free Tier Project，**不要按 Set up billing**，也不要輸入信用卡。
4. 複製 key 後立刻切到 Zeabur；不要貼進 LINE、GitHub、作業、聊天視窗或截圖。
5. 到 Zeabur 服務的 **Variables → Edit as Raw**，新增：

```dotenv
GEMINI_API_KEY=貼上你剛複製的值
GEMINI_MODEL=gemini-3.7-flash
AI_DAILY_LIMIT=12
```

6. 按 **Redeploy**，再開啟：

```text
https://<你的-zeabur-網域>/healthz
```

預期會看到 `"aiEnabled":true`。接著從手機傳一個沒有在關鍵字清單裡的簡單問題，例如「你們有什麼招牌？」。

### 這一步的安全規則

- Key 只會出現在兩個地方：你本機的 `.env` 與自己的 Zeabur Variables。它不是作業內容。
- 不要把姓名、電話、地址、訂位內容、付款資料或客訴細節交給 AI。模板偵測到常見個資格式時會改走真人客服。
- 免費層有模型與速率限制；模板預設同一位顧客每天最多 12 次 AI 問答。額度滿或 API 暫時失敗時，Bot 會回到真人客服，不會停止服務。
- 免費 Gemini API 的輸入與輸出可能被 Google 用於改善產品，因此不要把真實客人的敏感資料送進去。正式營運請重新評估資料與付費方案。

Google 官方說明：AI Studio 可建立或管理 API key，付費升級才需要設定 Cloud Billing；免費層有模型與用量限制。[取得 API key](https://ai.google.dev/gemini-api/docs/get-started)／[免費層與費率](https://ai.google.dev/gemini-api/docs/pricing)／[免費層資料條款](https://ai.google.dev/gemini-api/terms)

## 1. 建立自己的程式副本

### 0. 還沒有 GitHub 帳號？先註冊

1. 開啟 [github.com/signup](https://github.com/signup)。
2. 用你自己的 Email、密碼與帳號名稱完成註冊，並完成 Email 驗證。
3. 若出現「向右滑動」或圖片驗證，這是 GitHub 的真人驗證，**請自己完成**；助教不會代收密碼或驗證碼。
4. 課程只需免費帳號。先不要加入任何付費方案，也不要把 `.env`、LINE token 或 Gemini key 放進 GitHub。

> GitHub 密碼與 Email 驗證碼只屬於你本人。任何人說要「幫你設定」而索取這些資料，都不要提供。

### 1. 從課程 Template 建立自己的 Repo

老師會將此專案發布成 GitHub Template Repository。學生在 GitHub 點：

```text
Use this template → Create a new repository
```

建議 Repo 名稱：`my-restaurant-line-bot`。

請按 **Use this template → Create a new repository**，不要按 Fork。課堂作業建議先選 **Private**；若助教需要檢查，再透過 GitHub 的 Collaborators 邀請特定助教。不要把 `.env` 上傳來換取協助。

```powershell
git clone https://github.com/<你的帳號>/my-restaurant-line-bot.git
Set-Location .\my-restaurant-line-bot
npm install
Copy-Item .\docs\local-env.example .env
npm test
```

預期看到：`pass 10`、`fail 0`。

## 2. 建立自己的 LINE Channel

1. 在 LINE Official Account Manager 建自己的官方帳號。
2. 「設定 → Messaging API」啟用 Messaging API。
3. 在 LINE Developers Console 建立／選擇自己的 Provider。
4. 取得這兩個值，只填在你自己本機 `.env`：

```dotenv
LINE_CHANNEL_SECRET=貼上你自己的值
LINE_CHANNEL_ACCESS_TOKEN=貼上你自己的值
DEMO_MODE=1
DATA_DIR=./data
# 選做：有自己的 Gemini key 才填；不填仍是完整的 FAQ Bot。
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.7-flash
AI_DAILY_LIMIT=12
```

本機驗證：

```powershell
npm run preflight
node --env-file=.env src/server.js
```

另開一個 PowerShell 視窗：

```powershell
py -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:3000/healthz').read().decode())"
```

## 3. 推送自己的餐館資料

先修改 `src/seed/restaurant.json`，再執行：

```powershell
git add .
git commit -m "建立我的餐館 LINE Bot"
git push origin main
```

確認 `.env` 沒被提交：

```powershell
git status --short
```

若看見 `.env`，停止並確認 `.gitignore` 有 `.env`。

## 4. 在 Zeabur 建自己的服務

1. 登入 Zeabur，確認帳號維持 **Free Plan**，建立新 Project：`my-restaurant-line`。
2. 點 **Deploy New Service → GitHub**。
3. 選自己的 `my-restaurant-line-bot` Repo 與 `main` 分支。
4. 等 Zeabur 偵測 Dockerfile 並完成第一次部署。
5. 到服務 **Variables → Edit as Raw**，填入自己的值：

```dotenv
LINE_CHANNEL_SECRET=你的 Channel secret
LINE_CHANNEL_ACCESS_TOKEN=你的 Channel access token
DATA_DIR=/app/data
DEMO_MODE=1
GEMINI_API_KEY=你的 Gemini API key（選做）
GEMINI_MODEL=gemini-3.7-flash
AI_DAILY_LIMIT=12
```

6. 到服務 **Domains** 產生公開網域。
7. 按 **Redeploy**。

確認：

```text
https://<你的-zeabur-網域>/healthz
```

預期：

```json
{"ok":true,"stores":1,"demoMode":true}
```

Zeabur 的 GitHub 服務會在推送到連結分支時重新部署，環境變數在該服務的 Variables 設定。詳見 [Zeabur 部署說明](https://zeabur.com/docs/en-US/deploy) 與 [環境變數說明](https://zeabur.com/docs/en-US/deploy/config/environment-variables)。

## 5. 接上自己的 Webhook

```powershell
node scripts/line-admin.mjs webhook set https://<你的-zeabur-網域>/webhook
node scripts/line-admin.mjs webhook test
```

預期第二行包含 `success: true`。再到 LINE Developers Console 確認 Webhook enabled。

## 快速路線：Zeabur CLI／plugin

Zeabur CLI 很適合少點幾次網頁，但本課程有一條安全界線：**不要用 CLI 的 `project create` 建課程專案。** 目前 plugin 的建專案流程會要求選 ZeaburOS 伺服器；學生要做 Free Plan 短期 Demo，請仍在 Zeabur 網頁建立 Free Project。

建立好 Project 後，才在自己的專案目錄執行以下指令：

```powershell
Set-Location .\my-restaurant-line-bot
npx zeabur@latest auth status -i=false
npx zeabur@latest project list -i=false --json
```

從輸出找到自己剛建立的 Project ID，填入：

```powershell
npx zeabur@latest deploy --project-id <你的_PROJECT_ID> --json
```

第一次部署會建立 Service。記下回傳的 `service_id`，再填入：

```powershell
npx zeabur@latest service list --project-id <你的_PROJECT_ID> -i=false
npx zeabur@latest domain list --id <你的_SERVICE_ID> -i=false
```

之後程式修改後，只重部署同一個 Service，避免重複建立服務：

```powershell
npx zeabur@latest deploy --project-id <你的_PROJECT_ID> --service-id <你的_SERVICE_ID> --json
```

### CLI 不要做的事

- 不用 `project create`：Free Plan 課程改由網頁建立 Project，避免誤走伺服器租用流程。
- 不用 `variable env -f .env`：它會覆蓋服務原有的全部變數。
- Secret 與 token 建議在 Zeabur 後台 Variables 貼入；不要讓憑證出現在指令截圖、殼層歷史或課堂投影。
- 第一次部署後，把 Project ID、Service ID、Domain 寫到自己的筆記；重部署一定要帶 `--service-id`。

## 6. 關掉重複回覆

到自己的 LINE Official Account Manager → 回應設定：

- 開啟 Webhook。
- 關閉自動回應訊息。
- 歡迎訊息只保留一種：後台或 Bot follow 回覆，不要兩種都開。

## 7. 手機驗收

```text
1. 加好友：歡迎卡
2. 傳「營業時間」：店家資訊
3. 傳「訂位」：時間 → 人數 → 稱呼
4. 傳「真人客服」：留下問題
5. 傳「食物有異味」：建立優先回饋
```

## 常見問題

| 現象 | 先檢查 |
| --- | --- |
| `/healthz` 不是 ok | Zeabur Deployment log、Variables、是否重新部署 |
| Webhook test 失敗 | 網址是否是 `https://.../webhook`、服務是否健康 |
| LINE 沒回覆 | Webhook enabled、secret/token 是否同一個 Channel |
| 收到兩次訊息 | 關閉 OA Manager 的自動回應或歡迎訊息其中一種 |
| 重部署後資料消失 | demo 可接受；正式版需掛 Zeabur volume 到 `/app/data` |

## 老師交付前檢查

- [ ] 將此專案建立成 **GitHub Template Repository**。
- [ ] `.env` 不進版控，移除任何示範帳號資訊。
- [ ] 用一個全新的學生帳號走過本文件。
- [ ] 學生只交三張截圖：`/healthz` 畫面、手機上的對話、訂位那一句；不交憑證。
