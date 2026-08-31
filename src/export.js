// 把聊天紀錄變成兩份 CSV，餐館老闆下載下來直接丟給 AI 看。
//
// 為什麼不是在後台貼標籤：
//   貼標籤要老闆每天打烊前手動做一次，70 個人裡不會有 5 個做滿一週。
//   而且「這個客人算不算沉睡」本來就是算得出來的——最後一次講話到今天幾天，
//   不需要人去判斷、更不需要人去點。
//
// 兩份檔案各自回答一個問題：
//   questions.csv  客人到底在問什麼？哪些我的 Bot 答不出來？→ 答不出來的就是要補的 FAQ
//   customers.csv  誰常來、誰不見了？→ 沉睡客名單是算出來的

/** CSV 欄位跳脫。逗號、引號、換行都要包起來，不然 Excel 會把一格拆成兩格。 */
const cell = (v) => {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const toCsv = (header, rows) =>
  // BOM 開頭：Excel 沒有它會把中文顯示成亂碼
  "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";

/**
 * 把 LINE user ID 換成「客A01」這種代號。
 * 老闆看得懂、排序穩定，而且檔案外流也認不出是誰。
 */
export function labeller() {
  const seen = new Map();
  return (userId) => {
    if (!seen.has(userId)) {
      const n = seen.size;
      seen.set(userId, `客${String.fromCharCode(65 + Math.floor(n / 99))}${String(n % 99 + 1).padStart(2, "0")}`);
    }
    return seen.get(userId);
  };
}

const day = (iso) => String(iso || "").slice(0, 10);

/** 兩個日期差幾天。用日期字串比，避免時區把「今天」算成昨天。 */
export function daysBetween(fromIso, toIso) {
  const a = Date.parse(day(fromIso) + "T00:00:00Z");
  const b = Date.parse(day(toIso) + "T00:00:00Z");
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

/** 每一句問話一列。答不出來的排在最前面，因為那才是要動手改的。 */
export function questionsCsv(rows) {
  const label = labeller();
  const sorted = [...rows].sort((x, y) =>
    (y.matched === "unknown") - (x.matched === "unknown")
    || String(y.created_at).localeCompare(String(x.created_at)));
  return toCsv(
    ["日期", "客人", "客人問了什麼", "Bot 答出來了嗎", "被哪條規則接走"],
    sorted.map((r) => [
      day(r.created_at),
      label(r.line_user_id),
      r.body,
      r.matched === "unknown" ? "沒有" : "有",
      r.matched,
    ]),
  );
}

/**
 * 每位客人一列。沉睡天數＝最後一次講話到今天。
 * @param today ISO 字串。由呼叫端傳入，函式本身不讀時鐘，測試才驗得動。
 */
export function customersCsv(rows, today) {
  const label = labeller();
  return toCsv(
    ["客人", "問過幾次", "第一次", "最後一次", "幾天沒來", "Bot 答不出來幾次"],
    rows.map((r) => [
      label(r.line_user_id),
      r.asked,
      day(r.first_at),
      day(r.last_at),
      daysBetween(r.last_at, today),
      r.unanswered || 0,
    ]),
  );
}
