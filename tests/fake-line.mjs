import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.LINE_CHANNEL_SECRET = "test";
process.env.NODE_ENV = "test";

const { config } = await import("../src/config.js");
const { openDb } = await import("../src/db.js");
const { createApp } = await import("../src/app.js");
const { V } = await import("../src/views.js");
const { createGeminiAssistant } = await import("../src/modules/gemini.js");
const { restaurant } = await import("../src/modules/knowledge.js");

function fakeLine() {
  const sent = [];
  return {
    sent,
    drain: () => sent.splice(0),
    async replyOrPush(_token, _to, messages) { sent.push(...messages); return "reply"; },
  };
}

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "xiaowei-restaurant-"));
const line = fakeLine();
const db = openDb(dataDir);
const app = createApp({ line, db, config, log: { error() {} } });
const userId = "Utest000000000000000000000000001";
let eventNo = 0;
const ev = (event) => app.handleEvent({ source: { userId }, replyToken: "reply-token", webhookEventId: `event-${++eventNo}`, ...event });
const texts = () => line.drain().map((m) => `${m.type === "flex" ? m.altText : m.text}`).join("\n");

test("config 測試模式允許缺憑證", () => {
  assert.equal(config.testMode, true);
  assert.ok(config.line.channelAccessToken);
});

test("follow 顯示餐館入口", async () => {
  await ev({ type: "follow" });
  assert.match(texts(), /小微示範小館/);
});

test("已確認知識：營業時間、地點與菜單", async () => {
  await ev({ type: "message", message: { type: "text", text: "今天有開嗎" } });
  assert.match(texts(), /營業時間/);
  await ev({ type: "message", message: { type: "text", text: "怎麼去" } });
  assert.match(texts(), /地址與交通/);
  await ev({ type: "message", message: { type: "text", text: "菜單" } });
  assert.match(texts(), /小微小館菜單/);
});

test("訂位只建立待確認案件，不承諾成功", async () => {
  await ev({ type: "message", message: { type: "text", text: "訂位" } });
  assert.match(texts(), /想訂哪一天/);
  await ev({ type: "message", message: { type: "text", text: "週六 18:30" } });
  assert.match(texts(), /幾位用餐/);
  await ev({ type: "message", message: { type: "text", text: "4 位" } });
  assert.match(texts(), /訂位姓名/);
  await ev({ type: "message", message: { type: "text", text: "王小明" } });
  assert.match(texts(), /已收到訂位需求/);
  assert.equal(db.getPending(userId), null);
  const row = db.raw.prepare("SELECT * FROM reservations WHERE line_user_id = ? ORDER BY id DESC LIMIT 1").get(userId);
  assert.equal(row.status, "pending");
  assert.equal(row.contact_name, "王小明");
});

test("真人客服與緊急回饋會建立處理案件", async () => {
  const handoffBefore = db.raw.prepare("SELECT count(*) AS n FROM handoffs").get().n;
  await ev({ type: "message", message: { type: "text", text: "真人客服" } });
  assert.match(texts(), /已通知店員/);
  await ev({ type: "message", message: { type: "text", text: "我的餐點少了一樣" } });
  assert.match(texts(), /店員會接續處理/);
  assert.equal(db.raw.prepare("SELECT count(*) AS n FROM handoffs").get().n, handoffBefore + 1);
  assert.equal(db.raw.prepare("SELECT topic FROM handoffs ORDER BY id DESC LIMIT 1").get().topic, "我的餐點少了一樣");
  await ev({ type: "message", message: { type: "text", text: "給建議" } });
  texts();
  await ev({ type: "message", message: { type: "text", text: "食物有異味，請盡快處理" } });
  assert.match(texts(), /謝謝你的回饋/);
  assert.equal(db.raw.prepare("SELECT priority FROM feedback ORDER BY id DESC LIMIT 1").get().priority, "urgent");
});

test("未知問題不虛構回答；圖片交真人確認", async () => {
  db.clearPending(userId);
  await ev({ type: "message", message: { type: "text", text: "你們明天會不會送免費甜點" } });
  assert.match(texts(), /不確定/);
  await ev({ type: "message", message: { type: "image", id: "image-1" } });
  assert.match(texts(), /真人客服確認/);
});

test("AI key 未設定時，未知問題維持安全的真人轉接", async () => {
  db.clearPending(userId);
  await ev({ type: "message", message: { type: "text", text: "可以帶寵物嗎" } });
  assert.match(texts(), /不確定/);
});

test("選配 Gemini 僅回答安全的一般問題，並套用每日上限", async () => {
  let calls = 0;
  const ai = createGeminiAssistant({
    config: { ai: { geminiApiKey: "test-key", geminiModel: "gemini-3.7-flash", dailyLimit: 1 } },
    db,
    log: { warn() {} },
    fetchImpl: async () => {
      calls += 1;
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: "可以先帶寵物進店，但座位安排請點真人客服確認。" }] } }] }) };
    },
  });
  const aiUser = "Uai00000000000000000000000000001";
  const first = await ai.answer({ userId: aiUser, question: "可以帶寵物嗎", restaurant });
  assert.equal(first.kind, "answer");
  assert.equal(calls, 1);
  const second = await ai.answer({ userId: aiUser, question: "附近有停車場嗎", restaurant });
  assert.equal(second.kind, "limit");
  const privateInput = await ai.answer({ userId: "Uai00000000000000000000000000002", question: "我的電話是 0912345678", restaurant });
  assert.equal(privateInput.kind, "handoff");
  assert.equal(calls, 1);
});

test("重複 webhook 事件只處理一次", async () => {
  const event = { type: "message", message: { type: "text", text: "營業時間" }, webhookEventId: "duplicate-event", source: { userId }, replyToken: "reply-token" };
  await app.handleEvent(event);
  assert.equal(line.drain().length, 1);
  await app.handleEvent(event);
  assert.equal(line.drain().length, 0);
});

test("輸出符合 LINE 基本長度限制", () => {
  for (const message of [V.welcome(), V.menu(), V.help(), V.error(), V.unknown()]) {
    if (message.type === "flex") assert.ok(message.altText.length <= 400);
    for (const item of message.quickReply?.items || []) assert.ok(item.action.label.length <= 20);
  }
});

test("店家自己加的問答，優先於內建規則", async () => {
  const { parseFaq } = await import("../src/enroll.js");
  const { answerFromKnowledge } = await import("../src/modules/knowledge.js");

  // 表單上一行一題：關鍵字,關鍵字 = 回答。格式壞掉的行要被略過，不能讓 Bot 掛掉
  const faq = parseFaq([
    "停車,車位,停哪 = 門口不能停，走兩分鐘有市民停車場",
    "外送 = 只上 Uber Eats",
    "這行沒有等號",
    " = 只有等號沒有關鍵字",
  ].join("\n"));
  assert.equal(faq.length, 2);
  assert.deepEqual(faq[0].keywords, ["停車", "車位", "停哪"]);

  const store = { hours: "07:00–14:00", closed: "週二公休", address: "板橋", allergens: "含海鮮", menu: [], faq };

  // 客人打「有停車嗎」，關鍵字「停車」要命中店家自己寫的答案
  assert.equal(answerFromKnowledge("有停車嗎", store).body, "門口不能停，走兩分鐘有市民停車場");
  // 沒設過的題目仍走內建規則
  assert.equal(answerFromKnowledge("幾點開", store).title, "營業時間");
  // 完全沒設過也沒內建的，回 null（交給真人，不亂答）
  assert.equal(answerFromKnowledge("你們有 wifi 嗎", store), null);
  // 沒有 faq 欄位的店不能壞，而且要落回內建規則（「停車」屬於地址那一類）
  assert.equal(answerFromKnowledge("有停車嗎", { ...store, faq: undefined }).type, "location");
});

test.after(() => {
  db.raw.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("自訂圖文選單底圖優先，沒有時使用預設圖", async () => {
  const { chooseRichMenuImage, deployRichMenu } = await import("../worker/richmenu.js");
  const fallback = new Uint8Array([1]);
  const custom = new Uint8Array([2]);
  assert.equal(chooseRichMenuImage({ image: custom }, fallback), custom);
  assert.equal(chooseRichMenuImage(null, fallback), fallback);
  const uploaded = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).includes("api-data.line.me")) uploaded.push(init.body);
    if (String(url).endsWith("/richmenu/list")) return new Response(JSON.stringify({ richmenus: [] }));
    if (String(url).endsWith("/richmenu")) return new Response(JSON.stringify({ richMenuId: "menu-test" }));
    return new Response("");
  };
  try {
    await deployRichMenu("token", chooseRichMenuImage({ image: custom }, fallback));
    await deployRichMenu("token", chooseRichMenuImage(null, fallback));
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(uploaded[0], custom);
  assert.equal(uploaded[1], fallback);
});

test("FAQ 有圖片時回傳含 /img 網址的 Flex，沒圖片時不帶 hero", async () => {
  const sent = [];
  const customDb = { getPending: async () => null, getFaqImage: async (i) => i === 0 ? { image: new Uint8Array([1]) } : null };
  const customApp = createApp({
    line: { replyOrPush: async (_t, _u, messages) => sent.push(...messages) }, db: customDb,
    config: { ai: {} }, store: { ...restaurant, id: "shop", imageBaseUrl: "https://bot.example", faq: [
      { keywords: ["圖卡"], title: "圖卡", answer: "有圖片" },
      { keywords: ["純文字"], title: "純文字", answer: "沒有圖片" },
    ] }, log: { error() {} },
  });
  const event = (messageText) => customApp.handleEvent({ type: "message", message: { type: "text", text: messageText }, source: { userId: "Uimg" }, replyToken: "r" });
  await event("圖卡");
  const { createViews } = await import("../src/views.js");
  assert.equal(createViews({ ...restaurant, id: "shop", imageBaseUrl: "https://bot.example" }).faq("x", "y", null, "https://bot.example/img/shop/0").contents.hero.url, "https://bot.example/img/shop/0");
  await event("純文字");
  assert.equal(sent.pop().contents.hero, undefined);
});

test("歡迎與 fallback 都帶六個 quick reply", () => {
  assert.equal(V.welcome().quickReply.items.length, 6);
  assert.equal(V.unknown().quickReply.items.length, 6);
});

test("有影片網址時看影片回 video，沒有時回中文提示", async () => {
  const sent = [];
  const lineForVideo = { replyOrPush: async (_t, _u, messages) => sent.push(...messages) };
  const dbForVideo = { getPending: async () => null };
  const withVideo = createApp({ line: lineForVideo, db: dbForVideo, config: { ai: {} }, store: { ...restaurant, id: "shop", imageBaseUrl: "https://bot.example", videoUrl: "https://cdn.example/demo.mp4" }, log: { error() {} } });
  const watchVideo = String.fromCodePoint(0x770b, 0x5f71, 0x7247);
  await withVideo.handleEvent({ type: "message", message: { type: "text", text: watchVideo }, source: { userId: "Uvideo" }, replyToken: "r" });
  const { createViews } = await import("../src/views.js");
  assert.equal(createViews({ ...restaurant, id: "shop", imageBaseUrl: "https://bot.example", videoUrl: "https://cdn.example/demo.mp4" }).video().type, "video");
  const withoutVideo = createApp({ line: lineForVideo, db: dbForVideo, config: { ai: {} }, store: { ...restaurant }, log: { error() {} } });
  await withoutVideo.handleEvent({ type: "message", message: { type: "text", text: watchVideo }, source: { userId: "Uvideo2" }, replyToken: "r" });
  assert.equal(createViews({ ...restaurant }).videoUnavailable().type, "text");
});

test("圖文選單：六格座標鋪滿 2500×1686，不留縫、不重疊", async () => {
  const { buildAreas, buildRichMenu, LABELS } = await import("../worker/richmenu.js");
  const areas = buildAreas();
  assert.equal(areas.length, 6);

  // 右邊界與下邊界必須剛好等於整張圖，除不盡的餘數要補在最後一欄/列
  const right = Math.max(...areas.map((a) => a.bounds.x + a.bounds.width));
  const bottom = Math.max(...areas.map((a) => a.bounds.y + a.bounds.height));
  assert.equal(right, 2500);
  assert.equal(bottom, 1686);

  // 面積總和等於整張圖 → 沒有縫也沒有重疊
  const area = areas.reduce((n, a) => n + a.bounds.width * a.bounds.height, 0);
  assert.equal(area, 2500 * 1686);

  // 每格點下去送出的字，必須是 app.js 的 MENU_WORDS 認得的
  const MENU_WORDS = ["菜單", "營業時間", "怎麼去", "訂位", "真人客服", "給建議", "使用說明", "過敏原", "取消"];
  for (const a of areas) {
    assert.equal(a.action.type, "message");
    assert.ok(MENU_WORDS.includes(a.action.text), `選單送出「${a.action.text}」但 bot 不認得`);
    assert.ok(a.action.label.length <= 20);
  }
  assert.deepEqual(areas.map((a) => a.action.text), LABELS);

  // chatBarText 超過 14 字會被 LINE 退件，這裡要先截掉
  const menu = buildRichMenu({ chatBarText: "這串字故意寫得超過十四個字看會不會被截掉" });
  assert.ok(menu.chatBarText.length <= 14);
  assert.equal(menu.size.width, 2500);
  assert.equal(menu.selected, true);
});

test("聊天紀錄：問話被記下來，答不出來的排最前面", async () => {
  const { questionsCsv, customersCsv, daysBetween, labeller } = await import("../src/export.js");

  // 幾天沒來要用日期算，不要被時區推成前一天
  assert.equal(daysBetween("2026-07-01T23:50:00Z", "2026-07-31T00:10:00Z"), 30);
  assert.equal(daysBetween("", "2026-07-31T00:00:00Z"), 0);

  // 代號穩定：同一個人永遠同一個代號，換人才換
  const label = labeller();
  assert.equal(label("U-aaa"), "客A01");
  assert.equal(label("U-bbb"), "客A02");
  assert.equal(label("U-aaa"), "客A01");

  const csv = questionsCsv([
    { line_user_id: "U-aaa", body: "幾點開", matched: "hours", created_at: "2026-07-02T03:00:00Z" },
    { line_user_id: "U-bbb", body: "可以帶狗嗎", matched: "unknown", created_at: "2026-07-01T03:00:00Z" },
  ]);
  const lines = csv.trim().split("\r\n");
  // 答不出來的要排在第一列（表頭之後），那才是老闆今天要動手改的
  assert.match(lines[1], /可以帶狗嗎/);
  assert.match(lines[1], /沒有/);
  assert.match(lines[2], /幾點開/);
  assert.ok(csv.startsWith("﻿"), "缺 BOM，Excel 開起來會是亂碼");

  // 半形逗號、雙引號、換行都會把 Excel 的欄位拆掉，必須被跳脫。
  // （全形「，」不用跳脫，所以這裡要測的是半形那個。）
  const tricky = questionsCsv([
    { line_user_id: "U-a", body: '有停車嗎, 要"錢"嗎\n還是免費', matched: "unknown", created_at: "2026-07-02T03:00:00Z" },
  ]).trim();
  const dataRow = tricky.slice(tricky.indexOf("\r\n") + 2);
  assert.match(dataRow, /"有停車嗎, 要""錢""嗎\n還是免費"/);
  // 表頭 5 欄 → 資料列在引號外面只能剩 4 個逗號
  const outside = dataRow.replace(/"(?:[^"]|"")*"/g, "");
  assert.equal((outside.match(/,/g) || []).length, 4);

  const cust = customersCsv(
    [{ line_user_id: "U-aaa", asked: 5, first_at: "2026-05-01T00:00:00Z", last_at: "2026-06-01T00:00:00Z", unanswered: 2 }],
    "2026-07-01T00:00:00Z",
  ).trim().split("\r\n")[1];
  assert.equal(cust, "客A01,5,2026-05-01,2026-06-01,30,2");
});
