// LINE channel 管理 CLI：查 bot 資訊、設 webhook、管 rich menu、看額度。
// 讀專案根目錄的 .env（LINE_CHANNEL_ACCESS_TOKEN）。全部走 src/line/client.js，沒有第二套 API 實作。
//
// 用法：
//   npm run admin -- info
//   npm run admin -- webhook get
//   npm run admin -- webhook set https://你的網域/webhook
//   npm run admin -- webhook test
//   npm run admin -- richmenu list
//   npm run admin -- richmenu default <richMenuId>
//   npm run admin -- richmenu delete <richMenuId>
//   npm run admin -- richmenu link <lineUserId> <richMenuId>
//   npm run admin -- quota
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
if (fs.existsSync(".env")) process.loadEnvFile(".env");

const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
if (!token) fail("缺 LINE_CHANNEL_ACCESS_TOKEN。複製 docs/local-env.example 成 .env 並填入 channel access token。");

const { createLineClient } = await import("../src/line/client.js");
const line = createLineClient({ channelAccessToken: token, channelSecret: process.env.LINE_CHANNEL_SECRET || "" });

const [cmd, ...args] = process.argv.slice(2);
const print = (o) => console.log(typeof o === "string" ? o : JSON.stringify(o, null, 2));

try {
  switch (cmd) {
    case "info": {
      const info = await line.getBotInfo();
      print(info);
      break;
    }
    case "webhook": {
      const [sub, url] = args;
      if (sub === "get") print(await line.getWebhook());
      else if (sub === "set") {
        if (!url) fail("用法：npm run admin -- webhook set https://你的網域/webhook");
        if (!url.startsWith("https://")) fail("webhook 必須是 https");
        print(await line.setWebhook(url));
        console.log("已設定，接著跑 `npm run admin -- webhook test` 確認 LINE 打得到");
      } else if (sub === "test") {
        const r = await line.testWebhook(url);
        print(r);
        if (r.statusCode !== 200) console.log(`⚠ 回應碼 ${r.statusCode}（${r.reason || "unknown"}）：確認服務已部署、路徑是 /webhook、且簽章驗證沒把 LINE 的測試請求擋掉`);
      } else fail("webhook 子指令：get / set <url> / test [url]");
      break;
    }
    case "richmenu": {
      const [sub, a, b] = args;
      if (sub === "list") {
        const { richmenus = [] } = await line.listRichMenus();
        const def = await line.getDefaultRichMenu().catch(() => ({}));
        if (!richmenus.length) console.log("（沒有任何 rich menu）");
        for (const m of richmenus) {
          console.log(`${m.richMenuId}  ${m.name}  chatBar=${m.chatBarText}  areas=${m.areas.length}${m.richMenuId === def.richMenuId ? "  ← 目前預設" : ""}`);
        }
      } else if (sub === "default") {
        if (!a) fail("用法：npm run admin -- richmenu default <richMenuId>");
        print(await line.setDefaultRichMenu(a));
        console.log("已設為全體預設");
      } else if (sub === "delete") {
        if (!a) fail("用法：npm run admin -- richmenu delete <richMenuId>");
        print(await line.deleteRichMenu(a));
        console.log("已刪除");
      } else if (sub === "link") {
        if (!a || !b) fail("用法：npm run admin -- richmenu link <lineUserId> <richMenuId>");
        print(await line.linkRichMenu(a, b));
        console.log("已綁定到該使用者（會蓋過預設選單）");
      } else if (sub === "unlink") {
        if (!a) fail("用法：npm run admin -- richmenu unlink <lineUserId>");
        print(await line.unlinkRichMenu(a));
        console.log("已解除，該使用者回到預設選單");
      } else fail("richmenu 子指令：list / default <id> / delete <id> / link <userId> <id> / unlink <userId>");
      break;
    }
    case "quota": {
      const q = await line.getQuota();
      print(q);
      if (q.type === "limited") console.log(`本月 push 額度 ${q.value}，已用 ${q.totalUsage ?? "?"}`);
      else console.log("此帳號 push 額度為 none/limited 以外的型態（多半是無上限方案）");
      break;
    }
    default:
      console.log(`指令：
  info                                查 bot 基本資料（驗 token 是否有效）
  webhook get                         看目前 webhook 設定
  webhook set <https://…/webhook>     設定 webhook URL
  webhook test [url]                  叫 LINE 打一次 webhook，看回應碼
  richmenu list                       列出所有 rich menu 與目前預設
  richmenu default <id>               設為全體預設
  richmenu delete <id>                刪除
  richmenu link <userId> <id>         綁到單一使用者
  richmenu unlink <userId>            解除單一使用者的綁定
  quota                               本月 push 額度與用量`);
  }
} catch (e) {
  fail(e.message);
}

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}
