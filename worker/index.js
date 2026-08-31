// Cloudflare Workers 入口。
//
// 為什麼從 Zeabur / Render 換到這裡（2026-08-30）：
//   1. Zeabur 於 2026-08-27 發生「未授權存取專案環境變數」資安事件，
//      不能再叫學員把自己的 LINE 憑證貼進去。
//   2. Render 免費層閒置 15 分鐘就休眠、喚醒約 1 分鐘，而 LINE 規定 webhook
//      要 2 秒內回應；且官方明講本機 SQLite 在休眠時會被清空。
//   3. Workers 不休眠、冷啟動約 5 毫秒，D1 免費 5GB 永久保存，都免信用卡。
//
// 免費層的真正限制是「每次呼叫 10 毫秒 CPU 時間」——但等網路的時間不算 CPU 時間，
// 這支 bot 九成時間在等 LINE API，實際 CPU 只用掉幾毫秒。
import { createLineClient } from "./line.js";
import { createDb, ensureSchema, scopeDb } from "./db.js";
import { createApp } from "./app.js";
import { joinForm, joinDone, storeForm, parseMenu, parseFaq } from "../src/enroll.js";
import { deployRichMenu, chooseRichMenuImage } from "./richmenu.js";
import { questionsCsv, customersCsv } from "../src/export.js";
// wrangler.jsonc 的 Data rule 讓這個 import 直接拿到 ArrayBuffer（見 tools/make_richmenu_image.py）
import richMenuImage from "../assets/richmenu-default.jpg";
import restaurant from "../src/seed/restaurant.json";

const DEFAULT_STORE = {
  ...restaurant, id: "student", name: "我的店", menu: [],
  address: "（還沒填）", mapUrl: "", phone: "",
};

const html = (body, status = 200) =>
  new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

const norm = (raw) =>
  String(raw || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24);

function storeOf(row) {
  let s = { ...DEFAULT_STORE };
  if (row?.store_json) {
    try {
      s = { ...s, ...JSON.parse(row.store_json) };
    } catch { /* 壞掉就用預設，不要讓一個學員的髒資料弄壞他的 bot */ }
  }
  if (row) {
    s.id = row.code;
    if (!s.name || s.name === DEFAULT_STORE.name) s.name = row.name;
  }
  return s;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    await ensureSchema(env.DB);
    const db = createDb(env.DB);
    const base = env.PUBLIC_BASE_URL?.replace(/\/$/, "") || url.origin;
    const classCode = env.CLASS_JOIN_CODE || "";
    const cfg = {
      ai: {
        geminiApiKey: env.GEMINI_API_KEY || "",
        geminiModel: env.GEMINI_MODEL || "gemini-3.7-flash",
        dailyLimit: Number(env.AI_DAILY_LIMIT || 12),
      },
    };

    // ---------- 健康檢查 ----------
    if (path === "/healthz") {
      return json({
        ok: true,
        runtime: "cloudflare-workers",
        tenants: await db.countTenants(),
        aiEnabled: Boolean(cfg.ai.geminiApiKey),
      });
    }
    if (path === "/") return new Response("line-bot on cloudflare workers", { status: 200 });

    // LINE Flex/video 會從公開網址拉圖；動態圖片保留在 D1，不經靜態 import。
    const imageRoute = path.match(/^\/img\/([a-z0-9-]+)\/([a-z0-9-]+)$/);
    if (imageRoute && request.method === "GET") {
      const code = norm(imageRoute[1]);
      const tenant = await db.getTenant(code);
      if (!tenant) return new Response("not found", { status: 404 });
      const image = imageRoute[2] === "default"
        ? { image: richMenuImage, content_type: "image/jpeg" }
        : await db.getFaqImage(code, Number(imageRoute[2]));
      if (!image?.image) return new Response("not found", { status: 404 });
      // D1 讀回 BLOB 是 number[]，直接丟給 new Response() 會被當成空 body（實測 0 bytes、破圖）。
      // 打包進來的預設圖是 ArrayBuffer，本來就正常；這裡統一轉成位元組陣列，兩種來源都服務得出圖。
      const raw = image.image;
      const bytes = (raw instanceof ArrayBuffer || ArrayBuffer.isView(raw)) ? raw : new Uint8Array(raw);
      return new Response(bytes, { headers: {
        "content-type": image.content_type || "image/jpeg",
        "cache-control": "public, max-age=3600",
      } });
    }

    // ---------- 每位學員一條 webhook ----------
    const hook = path.match(/^\/webhook\/([a-z0-9-]+)$/);
    if (hook && request.method === "POST") {
      const row = await db.getTenant(norm(hook[1]));
      if (!row) return new Response("unknown tenant", { status: 404 });
      const raw = await request.arrayBuffer();
      const line = createLineClient({
        channelSecret: row.channel_secret,
        channelAccessToken: row.channel_access_token,
      });
      if (!await line.verifySignature(raw, request.headers.get("x-line-signature"))) {
        return new Response("bad signature", { status: 401 });
      }
      let body;
      try {
        body = JSON.parse(new TextDecoder().decode(raw) || "{}");
      } catch {
        return new Response("bad json", { status: 400 });
      }
      const app = createApp({
        line, db: scopeDb(db, row.code), config: cfg, store: { ...storeOf(row), imageBaseUrl: base },
      });
      // 先回 200，事件在背景處理：LINE 要求快速回應，處理慢會被停用 webhook
      ctx.waitUntil(Promise.all(
        (Array.isArray(body.events) ? body.events : [])
          .map((ev) => app.handleEvent(ev).catch((e) => console.error(`[${row.code}]`, e))),
      ));
      return new Response(null, { status: 200 });
    }

    // ---------- 報名 ----------
    if (path === "/join" && request.method === "GET") {
      return html(joinForm({ needClassCode: Boolean(classCode) }));
    }
    if (path === "/join" && request.method === "POST") {
      const f = await request.formData();
      const v = Object.fromEntries([...f.entries()].map(([k, x]) => [k, String(x)]));
      const bad = (error) => html(joinForm({ error, values: v, needClassCode: Boolean(classCode) }), 400);
      if (classCode && (v.classCode || "").trim() !== classCode) return bad("課程通行碼不對。看一下投影片上那組。");
      const code = norm(v.code);
      if (code.length < 3) return bad("代號至少 3 個字，只能用英文小寫、數字或減號。");
      const name = (v.name || "").trim();
      const secret = (v.channelSecret || "").trim();
      const token = (v.channelAccessToken || "").trim();
      if (!name) return bad("店名要填。");
      if (secret.length < 20) return bad("Channel secret 看起來不對——它是一長串英數字，不是 Channel ID（純數字）。");
      if (token.length < 50) return bad("Channel access token 看起來太短。它非常長，記得整串複製。");
      const exists = await db.getTenant(code);
      if (exists && exists.name !== name) return bad(`代號「${code}」已經被「${exists.name}」用了，換一個。`);
      await db.upsertTenant({
        code, name, channelSecret: secret, channelAccessToken: token,
        storeJson: exists ? null : JSON.stringify({ ...DEFAULT_STORE, name }),
      });
      return html(joinDone({ code, name, baseUrl: base }));
    }

    // ---------- 自己改店家資料 ----------
    const me = path.match(/^\/me\/([a-z0-9-]+)$/);
    if (me && request.method === "GET") {
      const row = await db.getTenant(norm(me[1]));
      if (!row) return html(joinForm({ error: "找不到這個代號，先去 /join 報名。", needClassCode: Boolean(classCode) }), 404);
      return html(storeForm({
        code: row.code, name: row.name, store: storeOf(row),
        baseUrl: base, saved: url.searchParams.get("saved") === "1",
        menuId: url.searchParams.get("menu") || "",
        menuErr: url.searchParams.get("menuerr") || "",
      }));
    }
    const mePost = path.match(/^\/me\/([a-z0-9-]+)\/store$/);
    if (mePost && request.method === "POST") {
      const code = norm(mePost[1]);
      const row = await db.getTenant(code);
      if (!row) return new Response("unknown", { status: 404 });
      const f = await request.formData();
      const g = (k) => String(f.get(k) || "").trim();
      const store = {
        ...storeOf(row),
        name: g("name") || row.name,
        hours: g("hours"), closed: g("closed"), address: g("address"),
        mapUrl: g("mapUrl"), phone: g("phone"),
        allergens: g("allergens") || "請店員確認。",
        menu: parseMenu(f.get("menu")),
        faq: parseFaq(f.get("faq")),
        videoUrl: g("videoUrl"), videoPreviewUrl: g("videoPreviewUrl"),
        menuImageUrl: g("menuImageUrl") || storeOf(row).menuImageUrl || "",
      };
      await db.setTenantStore(code, JSON.stringify(store));
      for (let i = 0; i < store.faq.length; i++) {
        const file = f.get(`faqImage_${i}`);
        if (file && typeof file.arrayBuffer === "function") {
          if (file.size > 500 * 1024 || file.type !== "image/jpeg") return html(storeForm({ code, name: row.name, store, baseUrl: base }), 400);
          await db.setFaqImage(code, i, await file.arrayBuffer(), "image/jpeg");
        }
      }
      return Response.redirect(`${base}/me/${code}?saved=1`, 302);
    }

    const richMenuImagePost = path.match(/^\/me\/([a-z0-9-]+)\/richmenu-image$/);
    if (richMenuImagePost && request.method === "POST") {
      const code = norm(richMenuImagePost[1]);
      const row = await db.getTenant(code);
      if (!row) return new Response("unknown", { status: 404 });
      const file = (await request.formData()).get("richMenuImage");
      if (!file || typeof file.arrayBuffer !== "function" || file.type !== "image/jpeg" || file.size > 900 * 1024) {
        return new Response("圖片必須先壓成 JPEG，且不得超過 900KB", { status: 400 });
      }
      await db.setRichMenuImage(code, await file.arrayBuffer(), "image/jpeg");
      return Response.redirect(`${base}/me/${code}?saved=1`, 302);
    }

    // ---------- 下載聊天紀錄 ----------
    // 沉睡客、常見問題都從這兩份算出來，不必在後台手動貼標籤。
    const csv = path.match(/^\/me\/([a-z0-9-]+)\/(questions|customers)\.csv$/);
    if (csv) {
      const code = norm(csv[1]);
      const row = await db.getTenant(code);
      if (!row) return new Response("unknown", { status: 404 });
      const scoped = scopeDb(db, code);
      const body = csv[2] === "questions"
        ? questionsCsv(await scoped.listQuestions())
        : customersCsv(await scoped.listCustomers(), new Date().toISOString());
      return new Response(body, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="${code}-${csv[2]}.csv"`,
        },
      });
    }

    // ---------- 一鍵產生圖文選單 ----------
    // 手動在 LINE 後台畫六格要 15 分鐘，這裡三個 API 呼叫做完，約 3 秒。
    const menuPost = path.match(/^\/me\/([a-z0-9-]+)\/richmenu$/);
    if (menuPost && request.method === "POST") {
      const code = norm(menuPost[1]);
      const row = await db.getTenant(code);
      if (!row) return new Response("unknown", { status: 404 });
      try {
        const customImage = await db.getRichMenuImage(code);
        const { richMenuId } = await deployRichMenu(row.channel_access_token, chooseRichMenuImage(customImage, richMenuImage), {
          name: `${row.name} 主選單`,
          chatBarText: "點這裡看菜單",
        });
        return Response.redirect(`${base}/me/${code}?menu=${encodeURIComponent(richMenuId)}`, 302);
      } catch (e) {
        return Response.redirect(`${base}/me/${code}?menuerr=${encodeURIComponent(e.message.slice(0, 160))}`, 302);
      }
    }

    // ---------- 老師看全班進度（只回末四碼）----------
    if (path === "/api/tenants") {
      if (request.headers.get("authorization") !== `Bearer ${env.ADMIN_TOKEN || ""}` || !env.ADMIN_TOKEN) {
        return json({ error: "unauthorized" }, 401);
      }
      return json(await db.listTenants());
    }

    return new Response("not found", { status: 404 });
  },
};
