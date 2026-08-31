// HTTP 入口：/webhook（LINE 事件）、/healthz（健康檢查）、/assets（Flex hero 圖等靜態檔）。
// 兩個一定要照做的地方：
//   1. webhook 必須先用 raw body 驗簽章，驗過才 JSON.parse（先 parse 再驗會因序列化差異驗不過）
//   2. 必須先回 200 再處理事件；LINE 要求快速回應，處理慢會被判定逾時甚至停用 webhook
//      Verify 按鈕送出的是 events: []，也要回 200
import express from "express";
import { config } from "./config.js";
import { createLineClient } from "./line/client.js";
import { openDb } from "./db.js";
import { createApp } from "./app.js";
import { createTenantRegistry } from "./tenants.js";
import { joinForm, joinDone, storeForm, parseMenu, parseFaq } from "./enroll.js";

const line = createLineClient(config.line);
const db = openDb(config.dataDir);
const app = createApp({ line, db, config });
const tenants = createTenantRegistry({ db, config });

const server = express();
server.disable("x-powered-by");

server.get("/", (_req, res) => res.type("text/plain").send("line-bot-template ok"));
server.use("/assets", express.static("assets", { maxAge: "1d", immutable: false }));
server.get("/healthz", (_req, res) => res.json({
  ok: true,
  stores: app.stores.length,
  tenants: db.listTenants().length,
  demoMode: config.demoMode,
  aiEnabled: Boolean(config.ai.geminiApiKey && config.ai.dailyLimit > 0),
  aiDailyLimit: config.ai.dailyLimit,
}));

server.post("/webhook", express.raw({ type: "*/*", limit: "2mb" }), async (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
  if (!line.verifySignature(raw, req.get("x-line-signature"))) return res.status(401).send("bad signature");
  let body;
  try {
    body = JSON.parse(raw.toString("utf8") || "{}");
  } catch {
    return res.status(400).send("bad json");
  }
  res.status(200).end(); // 先回 200，事件非同步處理
  for (const ev of Array.isArray(body.events) ? body.events : []) {
    app.handleEvent(ev).catch((e) => console.error("[handleEvent]", e));
  }
});

// ---------- 多租戶：每位學員一條 /webhook/<code> ----------
// 為什麼不共用同一條 /webhook：LINE 的簽章是用「該 channel 的 secret」算的，
// 不同學員的 secret 不一樣，必須先知道是誰才驗得了簽章。路徑就是身分。
server.post("/webhook/:code", express.raw({ type: "*/*", limit: "2mb" }), async (req, res) => {
  const t = tenants.get(req.params.code);
  if (!t) return res.status(404).send("unknown tenant");
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
  if (!t.client.verifySignature(raw, req.get("x-line-signature"))) return res.status(401).send("bad signature");
  let body;
  try {
    body = JSON.parse(raw.toString("utf8") || "{}");
  } catch {
    return res.status(400).send("bad json");
  }
  res.status(200).end();
  for (const ev of Array.isArray(body.events) ? body.events : []) {
    t.app.handleEvent(ev).catch((e) => console.error(`[tenant ${t.code}]`, e));
  }
});

// ---------- 學員報名頁 ----------
const form = express.urlencoded({ extended: false, limit: "64kb" });
const baseUrl = () => (config.publicBaseUrl || "").replace(/\/$/, "");
const CLASS_CODE = process.env.CLASS_JOIN_CODE || "";

server.get("/join", (_req, res) => res.type("html").send(joinForm({ needClassCode: Boolean(CLASS_CODE) })));

server.post("/join", form, (req, res) => {
  const v = req.body || {};
  const send = (error) => res.status(400).type("html")
    .send(joinForm({ error, values: v, needClassCode: Boolean(CLASS_CODE) }));
  if (CLASS_CODE && String(v.classCode || "").trim() !== CLASS_CODE) return send("課程通行碼不對。看一下投影片上那組。");
  const code = tenants.normalizeCode(v.code);
  if (code.length < 3) return send("代號至少 3 個字，只能用英文小寫、數字或減號。");
  const name = String(v.name || "").trim();
  const secret = String(v.channelSecret || "").trim();
  const token = String(v.channelAccessToken || "").trim();
  if (!name) return send("店名要填。");
  if (secret.length < 20) return send("Channel secret 看起來不對——它是一長串英數字，不是 Channel ID（純數字）。");
  if (token.length < 50) return send("Channel access token 看起來太短。它非常長，記得整串複製。");
  const exists = db.getTenant(code);
  if (exists && exists.name !== name) return send(`代號「${code}」已經被「${exists.name}」用了，換一個。`);
  db.upsertTenant({ code, name, channelSecret: secret, channelAccessToken: token,
                    storeJson: exists ? null : JSON.stringify({ ...tenants.DEFAULT_STORE, name }) });
  tenants.invalidate(code);
  res.type("html").send(joinDone({ code, name, baseUrl: baseUrl() || `${req.protocol}://${req.get("host")}` }));
});

server.get("/me/:code", (req, res) => {
  const t = db.getTenant(tenants.normalizeCode(req.params.code));
  if (!t) return res.status(404).type("html").send(joinForm({ error: "找不到這個代號，先去 /join 報名。", needClassCode: Boolean(CLASS_CODE) }));
  let store = {};
  try { store = JSON.parse(t.store_json || "{}"); } catch { store = {}; }
  res.type("html").send(storeForm({ code: t.code, name: t.name, store,
    baseUrl: baseUrl() || `${req.protocol}://${req.get("host")}`, saved: req.query.saved === "1" }));
});

server.post("/me/:code/store", form, (req, res) => {
  const code = tenants.normalizeCode(req.params.code);
  const t = db.getTenant(code);
  if (!t) return res.status(404).send("unknown");
  const v = req.body || {};
  let prev = {};
  try { prev = JSON.parse(t.store_json || "{}"); } catch { prev = {}; }
  const store = { ...tenants.DEFAULT_STORE, ...prev,
    name: String(v.name || t.name).trim(),
    hours: String(v.hours || "").trim(),
    closed: String(v.closed || "").trim(),
    address: String(v.address || "").trim(),
    mapUrl: String(v.mapUrl || "").trim(),
    phone: String(v.phone || "").trim(),
    allergens: String(v.allergens || "").trim() || "請店員確認。",
    menu: parseMenu(v.menu),
    faq: parseFaq(v.faq) };
  db.setTenantStore(code, JSON.stringify(store));
  tenants.invalidate(code);
  res.redirect(`/me/${code}?saved=1`);
});

// 內部管理 API：拿 channel secret 當 bearer，只給你自己／後台用，不要對外公開
server.get("/api/bindings", auth, (_req, res) => res.json(db.listBindings()));
// 老師看全班進度用。只回代號、店名與鑰匙末四碼，不回原文。
server.get("/api/tenants", auth, (_req, res) => res.json(db.listTenants()));

function auth(req, res, next) {
  if ((req.get("authorization") || "") === `Bearer ${config.line.channelSecret}`) return next();
  return res.status(401).json({ error: "unauthorized" });
}

server.listen(config.port, () => {
  console.log(`line-bot listening on :${config.port}（示範店 ${app.stores.length}，學員 ${db.listTenants().length} 位，報名頁 /join）`);
});
