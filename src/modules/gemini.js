// Gemini 是規則型客服的「最後一層」：只處理一般問題，不能處理訂位、過敏原、客訴或個資。
// 不設定 GEMINI_API_KEY 時，此模組完全停用，免費 FAQ Bot 一樣可運作。
const SENSITIVE_INPUT = [
  /\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i, // email
  /(?:\+?886|0)?9\d{8}/, // 台灣手機（含或不含國碼）
  /\b\d{7,}\b/, // 訂單、證件、卡號等長數字，寧可轉真人
  /(身分證|信用卡|卡號|密碼|帳號|地址|住址|統編)/,
];

const SAFE_FALLBACK = "這個問題需要店員確認，請點「真人客服」留下需求。我可以先幫你查菜單、營業時間或地址。";

export function isSafeForAi(input = "") {
  const text = String(input).trim();
  return text.length > 0 && text.length <= 240 && !SENSITIVE_INPUT.some((pattern) => pattern.test(text));
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function readText(payload) {
  return payload?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim() || "";
}

export function createGeminiAssistant({ config, db, fetchImpl = globalThis.fetch, log = console }) {
  if (!config.ai.geminiApiKey || config.ai.dailyLimit <= 0) return null;

  return {
    async answer({ userId, question, restaurant }) {
      if (!isSafeForAi(question)) return { kind: "handoff", text: SAFE_FALLBACK };

      const key = `gemini:${todayKey()}`;
      const used = Number(db.kvGet(userId, key) || 0);
      if (used >= config.ai.dailyLimit) {
        return { kind: "limit", text: "今天的 AI 問答額度已用完，請點「真人客服」讓店員協助。" };
      }

      const system = [
        `你是「${restaurant.name}」的餐館客服助手。`,
        `已確認店家資料：營業時間 ${restaurant.hours}；${restaurant.closed}；地址 ${restaurant.address}；電話 ${restaurant.phone}；菜單 ${restaurant.menu.map((item) => `${item.name} ${item.price}`).join("、")}。`,
        "只用繁體中文，最多 90 個中文字，語氣親切而簡短。",
        "只能回答上面已確認的店家資料；不知道就請顧客點「真人客服」，不得猜測或編造。",
        "遇到訂位、取消、過敏原、食安、客訴、付款、個資、無法確認的問題，請明確請顧客點「真人客服」。",
      ].join("\n");

      try {
        const response = await fetchImpl(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.ai.geminiModel)}:generateContent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": config.ai.geminiApiKey },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: system }] },
              contents: [{ role: "user", parts: [{ text: question }] }],
              generationConfig: { maxOutputTokens: 160, temperature: 0.2 },
            }),
            signal: AbortSignal.timeout(8000),
          },
        );
        if (!response.ok) throw new Error(`Gemini HTTP ${response.status}`);
        const text = readText(await response.json());
        if (!text || text.length > 360) throw new Error("Gemini response rejected");
        db.kvSet(userId, key, used + 1);
        return { kind: "answer", text };
      } catch (error) {
        log.warn?.("[gemini fallback]", error.message);
        return { kind: "unavailable", text: SAFE_FALLBACK };
      }
    },
  };
}
