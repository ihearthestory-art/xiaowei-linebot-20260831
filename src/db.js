// 本機儲存：用 Node 內建的 node:sqlite（不需原生編譯、不需額外套件）。
// 三張表：bindings（LINE 使用者 ↔ 你的帳號／店家）、pending（一問一答的等待狀態，10 分鐘過期）、
// kv（示範用的通用鍵值表，拿來存任何小東西；業務資料表照這個樣子往下加）。
// Node 22 需要 `--experimental-sqlite` 旗標，Node 24 免旗標（只會噴 ExperimentalWarning）。
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

/** pending 多久沒動作就視同放棄（毫秒） */
export const PENDING_TTL_MS = 10 * 60 * 1000;

export function openDb(dataDir, fileName = "bot.sqlite") {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, fileName));
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS tenants (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      channel_secret TEXT NOT NULL,
      channel_access_token TEXT NOT NULL,
      store_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bindings (
      line_user_id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL,
      display_name TEXT,
      bound_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pending (
      line_user_id TEXT PRIMARY KEY,
      mode TEXT NOT NULL,
      payload TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS kv (
      scope TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (scope, key)
    );
    CREATE TABLE IF NOT EXISTS reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      line_user_id TEXT NOT NULL,
      requested_at TEXT NOT NULL,
      party_size TEXT NOT NULL,
      contact_name TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS handoffs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      line_user_id TEXT NOT NULL,
      topic TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      line_user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      priority TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  line_user_id TEXT NOT NULL,
  body TEXT NOT NULL,
  matched TEXT NOT NULL,
  created_at TEXT NOT NULL
);
  `);

  const now = () => new Date().toISOString();

  const nowIso = () => new Date().toISOString();
  return {
    // 聊天紀錄：沉睡客與常見問題都從這裡算出來，不必手動貼標籤
    logMessage(userId, body, matched) {
      db.prepare("INSERT INTO messages (line_user_id, body, matched, created_at) VALUES (?, ?, ?, ?)")
        .run(userId, String(body).slice(0, 500), matched, nowIso());
    },
    listQuestions(limit = 2000) {
      return db.prepare("SELECT line_user_id, body, matched, created_at FROM messages ORDER BY created_at DESC LIMIT ?").all(limit);
    },
    listCustomers() {
      return db.prepare(`SELECT line_user_id, COUNT(*) AS asked, MIN(created_at) AS first_at,
                                MAX(created_at) AS last_at,
                                SUM(CASE WHEN matched = 'unknown' THEN 1 ELSE 0 END) AS unanswered
                           FROM messages GROUP BY line_user_id ORDER BY last_at DESC`).all();
    },
    raw: db,

    // ---- 綁定：一個 LINE 使用者對應一個店家／帳號 ----
    // ---- 多租戶：一位學員一列，webhook 路徑用 code 分流 ----
    upsertTenant({ code, name, channelSecret, channelAccessToken, storeJson = null }) {
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO tenants (code, name, channel_secret, channel_access_token, store_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(code) DO UPDATE SET
          name = excluded.name,
          channel_secret = excluded.channel_secret,
          channel_access_token = excluded.channel_access_token,
          store_json = COALESCE(excluded.store_json, tenants.store_json),
          updated_at = excluded.updated_at
      `).run(code, name, channelSecret, channelAccessToken, storeJson, now, now);
      return this.getTenant(code);
    },
    getTenant(code) {
      return db.prepare("SELECT * FROM tenants WHERE code = ?").get(code) || null;
    },
    setTenantStore(code, storeJson) {
      db.prepare("UPDATE tenants SET store_json = ?, updated_at = ? WHERE code = ?")
        .run(storeJson, new Date().toISOString(), code);
      return this.getTenant(code);
    },
    deleteTenant(code) {
      db.prepare("DELETE FROM tenants WHERE code = ?").run(code);
    },
    /** 給老師看的清單，絕不回傳鑰匙原文，只給末四碼供核對。 */
    listTenants() {
      return db.prepare("SELECT code, name, channel_secret, channel_access_token, created_at, updated_at FROM tenants ORDER BY created_at").all()
        .map((r) => ({
          code: r.code,
          name: r.name,
          secretTail: String(r.channel_secret).slice(-4),
          tokenTail: String(r.channel_access_token).slice(-4),
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        }));
    },

    getBinding(userId) {
      return db.prepare("SELECT * FROM bindings WHERE line_user_id = ?").get(userId) || null;
    },
    bind(userId, storeId, displayName = null) {
      db.prepare(
        "INSERT INTO bindings (line_user_id, store_id, display_name, bound_at) VALUES (?, ?, ?, ?) ON CONFLICT(line_user_id) DO UPDATE SET store_id = excluded.store_id, display_name = excluded.display_name, bound_at = excluded.bound_at",
      ).run(userId, storeId, displayName, now());
    },
    unbind(userId) {
      db.prepare("DELETE FROM bindings WHERE line_user_id = ?").run(userId);
    },
    listBindings() {
      return db.prepare("SELECT * FROM bindings ORDER BY bound_at DESC").all();
    },

    // ---- 待回覆狀態：例如「請輸入備註」「請上傳照片」，收到下一則訊息就消化掉 ----
    setPending(userId, mode, payload = null) {
      db.prepare(
        "INSERT INTO pending (line_user_id, mode, payload, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(line_user_id) DO UPDATE SET mode = excluded.mode, payload = excluded.payload, updated_at = excluded.updated_at",
      ).run(userId, mode, payload ? JSON.stringify(payload) : null, now());
    },
    getPending(userId) {
      const row = db.prepare("SELECT * FROM pending WHERE line_user_id = ?").get(userId);
      if (!row) return null;
      if (Date.now() - Date.parse(row.updated_at) > PENDING_TTL_MS) {
        this.clearPending(userId);
        return null;
      }
      return { mode: row.mode, payload: row.payload ? JSON.parse(row.payload) : null };
    },
    clearPending(userId) {
      db.prepare("DELETE FROM pending WHERE line_user_id = ?").run(userId);
    },

    // ---- 示範用的通用鍵值表：scope 通常放 userId 或 storeId ----
    kvSet(scope, key, value) {
      db.prepare(
        "INSERT INTO kv (scope, key, value, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
      ).run(scope, key, JSON.stringify(value), now());
    },
    kvGet(scope, key) {
      const row = db.prepare("SELECT value FROM kv WHERE scope = ? AND key = ?").get(scope, key);
      return row ? JSON.parse(row.value) : null;
    },
    kvList(scope, limit = 20) {
      return db
        .prepare("SELECT key, value, updated_at FROM kv WHERE scope = ? ORDER BY updated_at DESC LIMIT ?")
        .all(scope, limit)
        .map((r) => ({ key: r.key, value: JSON.parse(r.value), updatedAt: r.updated_at }));
    },
    kvDelete(scope, key) {
      db.prepare("DELETE FROM kv WHERE scope = ? AND key = ?").run(scope, key);
    },

    createReservation(userId, { requestedAt, partySize, contactName }) {
      const r = db.prepare("INSERT INTO reservations (line_user_id, requested_at, party_size, contact_name, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)")
        .run(userId, requestedAt, partySize, contactName, now());
      return { id: Number(r.lastInsertRowid), requestedAt, partySize, contactName, status: "pending" };
    },
    createHandoff(userId, topic) {
      const r = db.prepare("INSERT INTO handoffs (line_user_id, topic, status, created_at) VALUES (?, ?, 'open', ?)").run(userId, topic, now());
      return { id: Number(r.lastInsertRowid), topic, status: "open" };
    },
    updateHandoff(id, userId, topic) {
      db.prepare("UPDATE handoffs SET topic = ? WHERE id = ? AND line_user_id = ?").run(topic, id, userId);
      return db.prepare("SELECT id, topic, status FROM handoffs WHERE id = ? AND line_user_id = ?").get(id, userId) || null;
    },
    createFeedback(userId, content, priority) {
      const r = db.prepare("INSERT INTO feedback (line_user_id, content, priority, created_at) VALUES (?, ?, ?, ?)").run(userId, content, priority, now());
      return { id: Number(r.lastInsertRowid), priority };
    },
  };
}
