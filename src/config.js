// 環境設定的單一入口：所有機密只從 env 讀，程式碼裡沒有任何預設值。
// 缺必要變數就 fail-fast（丟出清楚的錯誤訊息），不要讓 bot 帶著半套設定跑起來。
// 測試模式：NODE_ENV=test 或 LINE_CHANNEL_SECRET=test 時，允許缺憑證（用假值），方便跑 npm test。

export const TEST_MODE = process.env.NODE_ENV === "test" || process.env.LINE_CHANNEL_SECRET === "test";

/** 必填環境變數；缺了就丟錯，錯誤訊息直接告訴使用者要去 .env 補什麼 */
function required(name, hint) {
  const v = process.env[name];
  if (v) return v;
  if (TEST_MODE) return `test-${name.toLowerCase()}`;
  throw new Error(`缺少環境變數 ${name}${hint ? `（${hint}）` : ""}。請複製 docs/local-env.example 成 .env 並填值。`);
}

export const config = {
  port: Number(process.env.PORT || 3000),
  line: {
    channelSecret: required("LINE_CHANNEL_SECRET", "LINE Developers > channel > Basic settings"),
    channelAccessToken: required("LINE_CHANNEL_ACCESS_TOKEN", "LINE Developers > channel > Messaging API"),
  },
  // SQLite 檔案放哪；容器裡通常是 /app/data
  dataDir: process.env.DATA_DIR || "./data",
  // 對外網址，組 Flex hero 圖網址用；沒填卡片就不放圖，功能不受影響
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, ""),
  // 可用管理指令的 LINE userId（逗號分隔）
  adminUserIds: (process.env.ADMIN_USER_IDS || "").split(",").map((s) => s.trim()).filter(Boolean),
  // 示範模式：未綁定時把示範開通碼做成快捷鍵，正式上線設 DEMO_MODE=0
  demoMode: process.env.DEMO_MODE !== "0",
  // AI 是選配：沒有學生自己的 Gemini key，Bot 仍用可審核的 FAQ 與真人轉接正常運作。
  ai: {
    geminiApiKey: process.env.GEMINI_API_KEY || "",
    geminiModel: process.env.GEMINI_MODEL || "gemini-3.7-flash",
    // 每位 LINE 使用者每天可問幾次 AI；避免免費額度被單一使用者耗盡。
    dailyLimit: Math.max(0, Number(process.env.AI_DAILY_LIMIT || 12)),
  },
  testMode: TEST_MODE,
};
