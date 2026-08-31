// D1 資料層（Cloudflare Workers 版），對應 Node 版的 src/db.js。
//
// 兩個差別：
//   1. D1 的 API 是 async，所有方法都回 Promise；呼叫端要 await。
//   2. 沒有本機檔案，資料在 Cloudflare 的 D1，服務重啟或休眠都不會消失
//      （這正是從 Render/Zeabur 換過來的主因：那邊的 SQLite 會被清空）。
//
// 建表定義也保留在 worker/schema.sql，供既有專案手動維護；新部署的
// 空白 D1 會在 Worker isolate 首次使用時以批次方式初始化一次。
const PENDING_TTL_MIN = 10;

// Cloudflare 的 Git 部署會建立空白 D1，但不會替學生執行 schema.sql。
// 同一個 Worker isolate 只初始化一次；CREATE IF NOT EXISTS 讓多個 isolate
// 同時冷啟動時仍可安全重試。
const SCHEMA_STATEMENTS = [
`
CREATE TABLE IF NOT EXISTS tenants (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  channel_secret TEXT NOT NULL,
  channel_access_token TEXT NOT NULL,
  store_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`,
`
CREATE TABLE IF NOT EXISTS pending (
  line_user_id TEXT PRIMARY KEY,
  mode TEXT NOT NULL,
  payload TEXT,
  updated_at TEXT NOT NULL
);
`,
`
CREATE TABLE IF NOT EXISTS reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  line_user_id TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  party_size TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`,
`
CREATE TABLE IF NOT EXISTS handoffs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  line_user_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`,
`
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  line_user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  priority TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`,
`
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  line_user_id TEXT NOT NULL,
  body TEXT NOT NULL,
  matched TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`,
`CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(line_user_id)`,
`CREATE INDEX IF NOT EXISTS idx_reservations_user ON reservations(line_user_id)`,
`CREATE INDEX IF NOT EXISTS idx_handoffs_user ON handoffs(line_user_id)`,
`CREATE TABLE IF NOT EXISTS richmenu_images (tenant_code TEXT PRIMARY KEY, image BLOB NOT NULL, content_type TEXT NOT NULL DEFAULT 'image/jpeg', updated_at TEXT NOT NULL);`,
`CREATE TABLE IF NOT EXISTS faq_images (tenant_code TEXT NOT NULL, faq_index INTEGER NOT NULL, image BLOB NOT NULL, content_type TEXT NOT NULL DEFAULT 'image/jpeg', updated_at TEXT NOT NULL, PRIMARY KEY (tenant_code, faq_index));`,
];

let schemaReady;

export function ensureSchema(D1) {
  if (!schemaReady) {
    schemaReady = D1.batch(SCHEMA_STATEMENTS.map((statement) => D1.prepare(statement))).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

export function createDb(D1) {
  const now = () => new Date().toISOString();

  return {
    // ---- 一問一答的暫存狀態（10 分鐘過期）----
    async setPending(userId, mode, payload = null) {
      await D1.prepare(
        `INSERT INTO pending (line_user_id, mode, payload, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(line_user_id) DO UPDATE SET mode=excluded.mode,
           payload=excluded.payload, updated_at=excluded.updated_at`,
      ).bind(userId, mode, payload ? JSON.stringify(payload) : null, now()).run();
    },
    async getPending(userId) {
      const row = await D1.prepare("SELECT * FROM pending WHERE line_user_id = ?").bind(userId).first();
      if (!row) return null;
      // 過期就當作沒有：客人隔天才回一句「兩位」，不該被接成訂位人數
      if (Date.now() - Date.parse(row.updated_at) > PENDING_TTL_MIN * 60000) {
        await this.clearPending(userId);
        return null;
      }
      let payload = null;
      try {
        payload = row.payload ? JSON.parse(row.payload) : null;
      } catch {
        payload = null;
      }
      return { mode: row.mode, payload };
    },
    async clearPending(userId) {
      await D1.prepare("DELETE FROM pending WHERE line_user_id = ?").bind(userId).run();
    },

    // ---- 訂位：一律 pending，程式絕不宣稱訂位成功 ----
    async createReservation(userId, { requestedAt, partySize, contactName }) {
      const r = await D1.prepare(
        `INSERT INTO reservations (line_user_id, requested_at, party_size, contact_name, status, created_at)
         VALUES (?, ?, ?, ?, 'pending', ?) RETURNING id`,
      ).bind(userId, requestedAt, partySize, contactName, now()).first();
      return { id: r?.id, requestedAt, partySize, contactName, status: "pending" };
    },

    // ---- 真人客服案件 ----
    async createHandoff(userId, topic) {
      const r = await D1.prepare(
        `INSERT INTO handoffs (line_user_id, topic, status, created_at)
         VALUES (?, ?, 'open', ?) RETURNING id`,
      ).bind(userId, topic, now()).first();
      return { id: r?.id, topic, status: "open" };
    },
    async updateHandoff(id, userId, topic) {
      await D1.prepare("UPDATE handoffs SET topic = ? WHERE id = ? AND line_user_id = ?")
        .bind(topic, id, userId).run();
    },

    // ---- 回饋，負面／緊急標 urgent ----
    async createFeedback(userId, content, priority) {
      const r = await D1.prepare(
        `INSERT INTO feedback (line_user_id, content, priority, created_at)
         VALUES (?, ?, ?, ?) RETURNING id`,
      ).bind(userId, content, priority, now()).first();
      return { id: r?.id, content, priority };
    },

    // ---- 聊天紀錄：沉睡客與常見問題的唯一資料來源 ----
    // 只記客人主動問的問題。訂位流程裡他打的姓名、給建議的內容都不進這裡，
    // 那兩種各自存在 reservations／feedback，而且含個資。
    async logMessage(userId, body, matched) {
      await D1.prepare(
        `INSERT INTO messages (line_user_id, body, matched, created_at) VALUES (?, ?, ?, ?)`,
      ).bind(userId, String(body).slice(0, 500), matched, now()).run();
    },
    /** 某位學員的所有問話，新的在前。prefix 是 scopeDb 加的租戶前綴。 */
    async listQuestions(prefix, limit = 2000) {
      const { results = [] } = await D1.prepare(
        `SELECT line_user_id, body, matched, created_at FROM messages
          WHERE line_user_id LIKE ? ORDER BY created_at DESC LIMIT ?`,
      ).bind(`${prefix}::%`, limit).all();
      return results;
    },
    /** 每位客人一列：來過幾次、第一次、最後一次、答不出來幾次。 */
    async listCustomers(prefix) {
      const { results = [] } = await D1.prepare(
        `SELECT line_user_id,
                COUNT(*) AS asked,
                MIN(created_at) AS first_at,
                MAX(created_at) AS last_at,
                SUM(CASE WHEN matched = 'unknown' THEN 1 ELSE 0 END) AS unanswered
           FROM messages WHERE line_user_id LIKE ?
          GROUP BY line_user_id ORDER BY last_at DESC`,
      ).bind(`${prefix}::%`).all();
      return results;
    },

    // ---- 多租戶：一位學員一列 ----
    async upsertTenant({ code, name, channelSecret, channelAccessToken, storeJson = null }) {
      const t = now();
      await D1.prepare(
        `INSERT INTO tenants (code, name, channel_secret, channel_access_token, store_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(code) DO UPDATE SET name=excluded.name,
           channel_secret=excluded.channel_secret,
           channel_access_token=excluded.channel_access_token,
           store_json=COALESCE(excluded.store_json, tenants.store_json),
           updated_at=excluded.updated_at`,
      ).bind(code, name, channelSecret, channelAccessToken, storeJson, t, t).run();
      return this.getTenant(code);
    },
    getTenant(code) {
      return D1.prepare("SELECT * FROM tenants WHERE code = ?").bind(code).first();
    },
    async setTenantStore(code, storeJson) {
      await D1.prepare("UPDATE tenants SET store_json = ?, updated_at = ? WHERE code = ?")
        .bind(storeJson, now(), code).run();
      return this.getTenant(code);
    },
    /** 給老師看全班進度。只回末四碼，絕不回鑰匙原文。 */
    async listTenants() {
      const { results = [] } = await D1.prepare(
        "SELECT code, name, channel_secret, channel_access_token, created_at FROM tenants ORDER BY created_at",
      ).all();
      return results.map((r) => ({
        code: r.code,
        name: r.name,
        secretTail: String(r.channel_secret).slice(-4),
        tokenTail: String(r.channel_access_token).slice(-4),
        createdAt: r.created_at,
      }));
    },
    async countTenants() {
      const r = await D1.prepare("SELECT COUNT(*) AS n FROM tenants").first();
      return r?.n ?? 0;
    },
    async setRichMenuImage(code, bytes, contentType = "image/jpeg") {
      await D1.prepare(`INSERT INTO richmenu_images (tenant_code, image, content_type, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(tenant_code) DO UPDATE SET image=excluded.image, content_type=excluded.content_type, updated_at=excluded.updated_at`)
        .bind(code, bytes, contentType, now()).run();
    },
    getRichMenuImage(code) {
      return D1.prepare("SELECT image, content_type FROM richmenu_images WHERE tenant_code = ?").bind(code).first();
    },
    async setFaqImage(code, faqIndex, bytes, contentType = "image/jpeg") {
      await D1.prepare(`INSERT INTO faq_images (tenant_code, faq_index, image, content_type, updated_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(tenant_code, faq_index) DO UPDATE SET image=excluded.image, content_type=excluded.content_type, updated_at=excluded.updated_at`)
        .bind(code, faqIndex, bytes, contentType, now()).run();
    },
    getFaqImage(code, faqIndex) {
      return D1.prepare("SELECT image, content_type FROM faq_images WHERE tenant_code = ? AND faq_index = ?").bind(code, faqIndex).first();
    },
  };
}

/** 資料隔離：所有以 userId 為鍵的紀錄加租戶前綴，學員之間互不干擾。 */
export function scopeDb(db, code) {
  const p = (u) => `${code}::${u}`;
  return {
    ...db,
    setPending: (u, m, pl) => db.setPending(p(u), m, pl),
    getPending: (u) => db.getPending(p(u)),
    clearPending: (u) => db.clearPending(p(u)),
    createReservation: (u, d) => db.createReservation(p(u), d),
    createHandoff: (u, t) => db.createHandoff(p(u), t),
    updateHandoff: (id, u, t) => db.updateHandoff(id, p(u), t),
    createFeedback: (u, c, pr) => db.createFeedback(p(u), c, pr),
    logMessage: (u, b, m) => db.logMessage(p(u), b, m),
    listQuestions: (limit) => db.listQuestions(code, limit),
    listCustomers: () => db.listCustomers(code),
    setRichMenuImage: (bytes, contentType) => db.setRichMenuImage(code, bytes, contentType),
    getRichMenuImage: () => db.getRichMenuImage(code),
    setFaqImage: (faqIndex, bytes, contentType) => db.setFaqImage(code, faqIndex, bytes, contentType),
    getFaqImage: (faqIndex) => db.getFaqImage(code, faqIndex),
  };
}
