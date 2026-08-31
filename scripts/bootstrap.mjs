// 一鍵上線：驗 token → （可選）把環境變數推上部署平台 → （可選）設定並測試 webhook → 印檢查表。
// 所有 secret 只會被送到 LINE／部署平台，永遠不會印在畫面上（只印長度）。
//
// 用法：
//   node scripts/bootstrap.mjs                                   只驗 .env 裡的 token
//   node scripts/bootstrap.mjs --token <token> --secret <secret>  用參數覆蓋 .env
//   node scripts/bootstrap.mjs --zeabur-service <serviceId>       把 .env 的變數推上 Zeabur
//   node scripts/bootstrap.mjs --webhook https://你的網域/webhook  設定並測試 webhook
//   （可以一次全下）
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
if (fs.existsSync(".env")) process.loadEnvFile(".env");

/** 把值包成 shell 參數。含引號或 % 的值不處理（會被 cmd.exe 展開成變數），直接擋下來 */
function q(v) {
  const s = String(v);
  if (/["%`$]/.test(s)) throw new Error(`值含有 shell 特殊字元（" % \` $），請改用部署平台的網頁介面手動設定這個變數`);
  return `"${s}"`;
}

const argv = process.argv.slice(2);
const opt = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : null;
};

const token = opt("token") || process.env.LINE_CHANNEL_ACCESS_TOKEN;
const secret = opt("secret") || process.env.LINE_CHANNEL_SECRET;
const serviceId = opt("zeabur-service");
const webhook = opt("webhook");

const steps = [];
const mark = (name, ok, detail, next = "") => {
  steps.push({ name, ok, detail, next });
  console.log(`${ok ? "✅" : "❌"} ${name}：${detail}${ok || !next ? "" : `\n   → ${next}`}`);
};

// ---- 1. 憑證存在 ----
if (!token) {
  mark("channel access token", false, "沒有值", "到 LINE Developers Console > Messaging API 複製 long-lived token，填進 .env 的 LINE_CHANNEL_ACCESS_TOKEN，或用 --token 傳進來");
  process.exit(1);
}
mark("channel access token", true, `已讀到（${token.length} 字元）`);
mark("channel secret", Boolean(secret), secret ? `已讀到（${secret.length} 字元）` : "沒有值", "webhook 簽章驗證需要它，填進 .env 的 LINE_CHANNEL_SECRET");

const { createLineClient } = await import("../src/line/client.js");
const line = createLineClient({ channelAccessToken: token, channelSecret: secret || "" });

// ---- 2. 驗 token ----
let info;
try {
  info = await line.getBotInfo();
  mark("token 有效", true, `${info.displayName}（${info.basicId}）chatMode=${info.chatMode}${info.chatMode === "bot" ? "" : "（聊天模式；確認 OA Manager 回應設定：Webhook 開、自動回應關，兩者都對就收得到）"}`);
} catch (e) {
  mark("token 有效", false, e.message, "401 = token 打錯或已失效；403 = 這個 channel 沒開 Messaging API。到 Console 重發 token");
  process.exit(1);
}

// ---- 3. 額度 ----
try {
  const q = await line.getQuota();
  mark("push 額度", true, `type=${q.type}${q.value != null ? ` 上限 ${q.value}` : ""}${q.totalUsage != null ? ` 已用 ${q.totalUsage}` : ""}`);
} catch (e) {
  mark("push 額度", false, e.message, "不影響上線，之後用 `npm run admin -- quota` 再查");
}

// ---- 4. 推環境變數到部署平台（值不會印出來）----
if (serviceId) {
  const keys = ["LINE_CHANNEL_SECRET", "LINE_CHANNEL_ACCESS_TOKEN", "PUBLIC_BASE_URL", "ADMIN_USER_IDS", "DEMO_MODE", "DATA_DIR"];
  const present = keys.filter((k) => process.env[k]);
  let ok = true;
  for (const k of present) {
    try {
      // Windows 上 npx 是 .cmd，Node 不開 shell 就不肯執行；所以自己把參數包好引號再交給 shell。
      // 值可能含 secret，只走這一條路徑、不印出來。
      execSync(`npx zeabur@latest variable update --id ${q(serviceId)} -k ${q(`${k}=${process.env[k]}`)} -y -i=false`, {
        stdio: ["ignore", "ignore", "pipe"],
        timeout: 180000,
        windowsHide: true,
      });
      console.log(`   · ${k} 已設定（${String(process.env[k]).length} 字元）`);
    } catch (e) {
      ok = false;
      console.log(`   · ${k} 失敗：${String(e.stderr || e.message).slice(0, 160)}`);
    }
  }
  mark("部署平台環境變數", ok, `${present.length} 個變數（${present.join(", ")}）`, "先跑 `npx zeabur@latest auth login`，再確認 --zeabur-service 的 service id 沒打錯");
  console.log("   注意：改完變數要重新部署或重啟服務才會生效");
} else {
  console.log("⏭  部署平台環境變數：略過（要推就加 --zeabur-service <serviceId>）");
}

// ---- 5. webhook ----
if (webhook) {
  if (!webhook.startsWith("https://")) {
    mark("webhook 設定", false, "必須是 https", "LINE 只接受 https，且憑證要有效");
  } else {
    try {
      await line.setWebhook(webhook);
      mark("webhook 設定", true, webhook);
    } catch (e) {
      mark("webhook 設定", false, e.message, "確認 token 有 channel 設定權限；也可以到 Console 手動填 webhook URL");
    }
    try {
      const r = await line.testWebhook(webhook);
      const ok = r.statusCode === 200;
      mark("webhook 連通測試", ok, `statusCode=${r.statusCode} reason=${r.reason || "-"}`, "200 以外多半是：服務還沒部署完、路徑不是 /webhook、或簽章驗證把 LINE 的測試請求擋掉了（測試請求的簽章是有效的，別自己加額外檢查）");
    } catch (e) {
      mark("webhook 連通測試", false, e.message, "稍等服務起來再跑 `npm run admin -- webhook test`");
    }
  }
} else {
  console.log("⏭  webhook：略過（要設就加 --webhook https://你的網域/webhook）");
}

// ---- 檢查表 ----
const failed = steps.filter((s) => !s.ok);
console.log(`\n────────── 上線檢查表 ──────────`);
console.log(`${steps.filter((s) => s.ok).length}/${steps.length} 通過`);
console.log(`剩下要人工確認的：
  [ ] LINE Developers Console > Messaging API > 「自動回應訊息」關掉、「Webhook」開啟
  [ ] Rich Menu：py scripts/richmenu_compose.py 出圖 → py scripts/richmenu_deploy.py --apply
  [ ] 加自己的 LINE 好友，實測 follow → 開通碼 → 選單 → 圖片
  [ ] 用 /我的id 取得自己的 userId，填進 ADMIN_USER_IDS 才能用 /狀態
  [ ] 資料要保留的話，確認部署平台有把 volume 掛到 DATA_DIR`);
if (failed.length) {
  console.log(`\n先修這些：${failed.map((s) => s.name).join("、")}`);
  process.exit(1);
}
