-- D1 資料表。用 wrangler 帶上去（只要跑一次）：
--   npx wrangler d1 execute xiaowei-bot --remote --file=worker/schema.sql
--
-- 程式裡刻意不自動建表：免費層每天有寫入行數上限，
-- 不該每次請求都跑一次 CREATE TABLE IF NOT EXISTS。

CREATE TABLE IF NOT EXISTS tenants (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  channel_secret TEXT NOT NULL,
  channel_access_token TEXT NOT NULL,
  store_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pending (
  line_user_id TEXT PRIMARY KEY,
  mode TEXT NOT NULL,
  payload TEXT,
  updated_at TEXT NOT NULL
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

-- 客人問過的每一句話。沉睡客、常見問題都從這裡算出來，不必手動貼標籤。
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  line_user_id TEXT NOT NULL,
  body TEXT NOT NULL,
  matched TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS richmenu_images (
  tenant_code TEXT PRIMARY KEY,
  image BLOB NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'image/jpeg',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS faq_images (
  tenant_code TEXT NOT NULL,
  faq_index INTEGER NOT NULL,
  image BLOB NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'image/jpeg',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_code, faq_index)
);

CREATE INDEX IF NOT EXISTS idx_reservations_user ON reservations(line_user_id);
CREATE INDEX IF NOT EXISTS idx_handoffs_user ON handoffs(line_user_id);
