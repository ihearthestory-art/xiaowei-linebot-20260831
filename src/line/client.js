// LINE Messaging API 封裝：零依賴，只用內建 fetch 與 node:crypto，不裝官方 SDK。
// 兩個網域：一般 API 走 api.line.me，下載使用者傳來的檔案走 api-data.line.me。
// 額度觀念：reply 免費、push 吃每月訊息額度，流程盡量走 reply，reply 失敗才退回 push。
import crypto from "node:crypto";

const API = "https://api.line.me/v2/bot";
const API_DATA = "https://api-data.line.me/v2/bot";

export function createLineClient({ channelAccessToken, channelSecret }) {
  const headers = { authorization: `Bearer ${channelAccessToken}` };

  async function call(method, base, path, payload, timeoutMs = 15000) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: payload ? { ...headers, "content-type": "application/json" } : headers,
      body: payload ? JSON.stringify(payload) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`LINE ${method} ${path} ${res.status}: ${detail.slice(0, 300)}`);
    }
    const txt = await res.text().catch(() => "");
    if (!txt) return {};
    try {
      return JSON.parse(txt);
    } catch {
      return {};
    }
  }

  return {
    // ---------------- 簽章 ----------------
    /** 驗 webhook 簽章：HMAC-SHA256(channelSecret, rawBody) 的 base64，必須用「未經 JSON 解析的原始 bytes」 */
    verifySignature(rawBody, signature) {
      if (!signature) return false;
      const expected = crypto.createHmac("sha256", channelSecret).update(rawBody).digest("base64");
      const a = Buffer.from(expected);
      const b = Buffer.from(String(signature));
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    },

    // ---------------- 送訊息 ----------------
    reply(replyToken, messages) {
      return call("POST", API, "/message/reply", { replyToken, messages });
    },
    push(to, messages) {
      return call("POST", API, "/message/push", { to, messages });
    },
    /** reply token 只能用一次、約 1 分鐘過期；失敗自動退回 push（吃額度）。回傳實際用了哪一種 */
    async replyOrPush(replyToken, to, messages, log = console) {
      const list = Array.isArray(messages) ? messages : [messages];
      if (replyToken) {
        try {
          await this.reply(replyToken, list);
          return "reply";
        } catch (e) {
          log.error?.("[reply failed]", e.message);
        }
      }
      if (!to) return "dropped";
      await this.push(to, list);
      return "push";
    },
    /** 1 對 1 聊天顯示「輸入中」動畫；秒數必須是 5 的倍數，最多 60。失敗不影響主流程 */
    showLoading(chatId, loadingSeconds = 20) {
      return call("POST", API, "/chat/loading/start", { chatId, loadingSeconds }).catch(() => ({}));
    },

    // ---------------- 使用者與內容 ----------------
    getProfile(userId) {
      return call("GET", API, `/profile/${userId}`);
    },
    /** 下載使用者上傳的圖片／影片／檔案，回 Buffer。注意走 api-data 網域 */
    async getContent(messageId) {
      const res = await fetch(`${API_DATA}/message/${messageId}/content`, { headers, signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`LINE getContent ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    },

    // ---------------- Webhook 設定 ----------------
    getBotInfo() {
      return call("GET", API, "/info");
    },
    getWebhook() {
      return call("GET", API, "/channel/webhook/endpoint");
    },
    /** 設定 webhook URL（必須 https，且要能通過 LINE 的驗證請求） */
    setWebhook(endpoint) {
      return call("PUT", API, "/channel/webhook/endpoint", { endpoint });
    },
    /** 叫 LINE 打一次你的 webhook，回傳 statusCode / reason，用來確認線上是不是通的 */
    testWebhook(endpoint) {
      return call("POST", API, "/channel/webhook/test", endpoint ? { endpoint } : {}, 30000);
    },

    // ---------------- Rich Menu ----------------
    listRichMenus() {
      return call("GET", API, "/richmenu/list");
    },
    getDefaultRichMenu() {
      return call("GET", API, "/user/all/richmenu");
    },
    createRichMenu(body) {
      return call("POST", API, "/richmenu", body);
    },
    /** 上傳選單底圖：2500x1686 或 2500x843，JPEG/PNG 且 ≤ 1MB，走 api-data 網域 */
    async uploadRichMenuImage(richMenuId, buffer, contentType = "image/jpeg") {
      const res = await fetch(`${API_DATA}/richmenu/${richMenuId}/content`, {
        method: "POST",
        headers: { ...headers, "content-type": contentType },
        body: buffer,
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) throw new Error(`LINE uploadRichMenuImage ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
      return {};
    },
    setDefaultRichMenu(richMenuId) {
      return call("POST", API, `/user/all/richmenu/${richMenuId}`);
    },
    linkRichMenu(userId, richMenuId) {
      return call("POST", API, `/user/${userId}/richmenu/${richMenuId}`);
    },
    unlinkRichMenu(userId) {
      return call("DELETE", API, `/user/${userId}/richmenu`);
    },
    deleteRichMenu(richMenuId) {
      return call("DELETE", API, `/richmenu/${richMenuId}`);
    },

    // ---------------- 額度 ----------------
    /** 本月 push 額度與已用量；免費方案額度有限，上線前先看一眼 */
    async getQuota() {
      const [quota, consumption] = await Promise.all([
        call("GET", API, "/message/quota"),
        call("GET", API, "/message/quota/consumption").catch(() => ({})),
      ]);
      return { ...quota, totalUsage: consumption.totalUsage ?? null };
    },
  };
}
