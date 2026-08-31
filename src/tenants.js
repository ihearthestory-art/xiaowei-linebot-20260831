// 多租戶：一份程式、一台伺服器，服務全班每個人自己的 LINE 官方帳號。
//
// 為什麼要這樣做：課堂上 70 位學員各自要有「自己的」官方帳號，但讓 70 個人各自
// 部署一份程式，等於 70 台伺服器、70 次環境變數設定、70 個會卡住的地方。
// 改成學員只做「開自己的 LINE 官方帳號 → 拿兩把鑰匙 → 貼進報名頁」，
// 剩下的由老師這一台機器接手：依 webhook 路徑分流到對應的鑰匙與店家資料。
//
// 安全界線（課堂上一定要講）：
//   - 學員的 channel secret／access token 會存在老師的伺服器上。
//   - 課程結束後，學員回 LINE Developers Console 按一次「發行」換新 token，
//     舊的立刻失效，老師這台就再也動不了他的帳號。
//   - 這支程式不回傳、不記錄、不顯示任何鑰匙原文（只顯示末四碼供核對）。
import { createLineClient } from "./line/client.js";
import { createApp } from "./app.js";

const DEFAULT_STORE = {
  id: "student",
  name: "我的店",
  short: "我的店",
  hours: "每日 11:00–20:00",
  closed: "每週二公休",
  address: "（還沒填）",
  mapUrl: "",
  phone: "",
  reservationNote: "訂位需求會先記錄，再由店員確認；尚未收到確認前不代表訂位成功。",
  menu: [],
  allergens: "餐點可能含常見過敏原；有嚴重過敏請改由店員確認。",
};

/**
 * 租戶登錄簿。每個租戶 = 一位學員 = 一個 LINE channel。
 * 快取 LINE client 與 app 實例，避免每則訊息都重建。
 */
export function createTenantRegistry({ db, config, log = console }) {
  const cache = new Map();   // code -> { client, app, secret, updatedAt }

  function normalizeCode(raw) {
    return String(raw || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24);
  }

  function storeOf(row) {
    let store = { ...DEFAULT_STORE };
    if (row.store_json) {
      try {
        store = { ...store, ...JSON.parse(row.store_json) };
      } catch {
        log.warn?.(`[tenant ${row.code}] store_json 壞掉，用預設值`);
      }
    }
    store.id = row.code;
    if (!store.name || store.name === DEFAULT_STORE.name) store.name = row.name || DEFAULT_STORE.name;
    return store;
  }

  /** 取得（或建立）某個租戶的執行環境。找不到回 null。 */
  function get(rawCode) {
    const code = normalizeCode(rawCode);
    if (!code) return null;
    const row = db.getTenant(code);
    if (!row) return null;

    const hit = cache.get(code);
    if (hit && hit.updatedAt === row.updated_at) return hit;

    const line = createLineClient({
      channelSecret: row.channel_secret,
      channelAccessToken: row.channel_access_token,
    });
    // 資料隔離：所有以 userId 為鍵的紀錄都加租戶前綴，
    // 兩個學員的客人就算 LINE userId 相同也不會互相蓋掉。
    const scoped = scopeDb(db, code);
    const app = createApp({ line, db: scoped, config, log, store: storeOf(row) });
    const entry = { code, client: line, app, secret: row.channel_secret, updatedAt: row.updated_at };
    cache.set(code, entry);
    return entry;
  }

  function invalidate(rawCode) {
    cache.delete(normalizeCode(rawCode));
  }

  return { get, invalidate, normalizeCode, DEFAULT_STORE };
}

/** 把 db 包一層，所有 userId 自動加上租戶前綴。 */
function scopeDb(db, code) {
  const p = (userId) => `${code}::${userId}`;
  const strip = (row) => {
    if (!row) return row;
    if (typeof row.line_user_id === "string") {
      return { ...row, line_user_id: row.line_user_id.replace(`${code}::`, "") };
    }
    return row;
  };
  return {
    ...db,
    getBinding: (u) => strip(db.getBinding(p(u))),
    bind: (u, storeId, name) => db.bind(p(u), storeId, name),
    unbind: (u) => db.unbind(p(u)),
    listBindings: () => db.listBindings().filter((r) => String(r.line_user_id).startsWith(`${code}::`)).map(strip),
    setPending: (u, mode, payload) => db.setPending(p(u), mode, payload),
    getPending: (u) => db.getPending(p(u)),
    clearPending: (u) => db.clearPending(p(u)),
    createReservation: (u, data) => db.createReservation(p(u), data),
    createHandoff: (u, topic) => db.createHandoff(p(u), topic),
    updateHandoff: (id, u, topic) => db.updateHandoff(id, p(u), topic),
    createFeedback: (u, content, priority) => db.createFeedback(p(u), content, priority),
    kvSet: (scope, key, value) => db.kvSet(`${code}::${scope}`, key, value),
    kvGet: (scope, key) => db.kvGet(`${code}::${scope}`, key),
    kvList: (scope, limit) => db.kvList(`${code}::${scope}`, limit),
    kvDelete: (scope, key) => db.kvDelete(`${code}::${scope}`, key),
  };
}
