// LINE Messaging API 封裝（Cloudflare Workers 版）。
//
// 跟 src/line/client.js 的差別只有一個：簽章驗證改用 Web Crypto。
// Workers 沒有 node:crypto，但有標準的 crypto.subtle，功能一樣，寫法是 async。
// 其餘（reply / push / 額度觀念）與 Node 版一致：reply 免費、push 吃額度，先 reply 失敗才 push。
const API = "https://api.line.me/v2/bot";

export function createLineClient({ channelAccessToken, channelSecret }) {
  const headers = { authorization: `Bearer ${channelAccessToken}` };

  async function call(method, path, payload) {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: payload ? { ...headers, "content-type": "application/json" } : headers,
      body: payload ? JSON.stringify(payload) : undefined,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`LINE ${method} ${path} ${res.status}: ${detail.slice(0, 300)}`);
    }
    const txt = await res.text().catch(() => "");
    try {
      return txt ? JSON.parse(txt) : {};
    } catch {
      return {};
    }
  }

  /** LINE 用 channel secret 對「原始 body」算 HMAC-SHA256，再 base64 比對。 */
  async function verifySignature(rawBody, signature) {
    if (!signature) return false;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(channelSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const mac = await crypto.subtle.sign("HMAC", key, rawBody);
    const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
    // 長度不同就直接 false；長度相同用固定時間比較，避免時序側錄
    if (expected.length !== signature.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
    return diff === 0;
  }

  const reply = (replyToken, messages) => call("POST", "/message/reply", { replyToken, messages });
  const push = (to, messages) => call("POST", "/message/push", { to, messages });

  /** 先用免費的 reply；reply token 過期或失敗才退回 push。 */
  async function replyOrPush(replyToken, userId, messages, log = console) {
    try {
      if (replyToken) return await reply(replyToken, messages);
    } catch (e) {
      log.warn?.("[reply 失敗，改用 push]", e.message);
    }
    if (userId) return push(userId, messages);
  }

  return { call, verifySignature, reply, push, replyOrPush, info: () => call("GET", "/info") };
}
