import { createViews, MAIN_RAIL } from "./views.js";
import { text } from "./line/cards.js";
import { answerFromKnowledge, classifyIntent, restaurant, sentimentOf } from "./modules/knowledge.js";
import { createGeminiAssistant } from "./modules/gemini.js";

const MENU_WORDS = new Set(["菜單", "營業時間", "怎麼去", "訂位", "真人客服", "給建議", "使用說明", "過敏原", "取消"]);

// store 不給時用預設的示範餐館；多租戶模式下由 tenants.js 傳入該學員自己的店家資料。
export function createApp({ line, db, config, log = console, store = restaurant }) {
  const V = createViews(store);
  const seenEvents = new Set();
  const ai = createGeminiAssistant({ config, db, log });
  const reply = async (event, messages) => line.replyOrPush(event.replyToken, event.source?.userId, Array.isArray(messages) ? messages : [messages], log);
  async function handleEvent(event) {
    if (event.webhookEventId) { if (seenEvents.has(event.webhookEventId)) return; seenEvents.add(event.webhookEventId); }
    const userId = event.source?.userId; if (!userId) return;
    try {
      if (event.type === "follow") return reply(event, V.welcome());
      if (event.type === "postback") return reply(event, V.unknown());
      if (event.type === "message" && event.message?.type === "image") return reply(event, text("收到圖片。菜單、收據或食物問題目前請由真人客服確認。", MAIN_RAIL));
      if (event.type === "message" && event.message?.type === "text") return onText(event, userId, String(event.message.text).trim());
    } catch (e) { log.error?.("[event]", e.message); return reply(event, V.error()); }
  }
  /** 這句話是被哪條規則接走的。只用來做紀錄，不影響回覆。 */
  function matchedRule(msg) {
    if (MENU_WORDS.has(msg)) return msg;
    const k = answerFromKnowledge(msg, store);
    if (k) return k.type === "faq" ? `faq:${k.title}` : k.type;
    return classifyIntent(msg) || "unknown";
  }

  async function onText(event, userId, msg) {
    const pending = db.getPending(userId);
    // 只記客人主動問的問題。訂位流程中他打的姓名、給建議的內容不記，
    // 那兩種各自存在 reservations／feedback，而且含個資。
    if (!pending && msg !== "取消") {
      try {
        await db.logMessage?.(userId, msg, matchedRule(msg));
      } catch (e) {
        log.error?.("[logMessage]", e.message);   // 記錄失敗不能害客人收不到回覆
      }
    }
    if (msg === "取消" && pending) { db.clearPending(userId); return reply(event, text("已取消，想做什麼可從下方選單開始。", MAIN_RAIL)); }
    if (pending && !MENU_WORDS.has(msg)) {
      const p = pending.payload || {};
      if (pending.mode === "reservation_time") { db.setPending(userId, "reservation_party", { ...p, requestedAt: msg }); return reply(event, V.reservationParty()); }
      if (pending.mode === "reservation_party") { db.setPending(userId, "reservation_name", { ...p, partySize: msg }); return reply(event, V.reservationName()); }
      if (pending.mode === "reservation_name") { db.clearPending(userId); return reply(event, V.reservationReceived(db.createReservation(userId, { ...p, contactName: msg }))); }
      if (pending.mode === "feedback") { db.clearPending(userId); return reply(event, V.feedbackSaved(db.createFeedback(userId, msg, sentimentOf(msg)))); }
      if (pending.mode === "handoff") { db.clearPending(userId); db.updateHandoff(p.id, userId, msg); return reply(event, text("已補上你的問題，店員會接續處理。", MAIN_RAIL)); }
    }
    if (msg === "訂位") { db.setPending(userId, "reservation_time"); return reply(event, V.reservationTime()); }
    if (msg === "真人客服") { const t = db.createHandoff(userId, "等待客人補充問題"); db.setPending(userId, "handoff", { id: t.id }); return reply(event, V.handoff(t)); }
    if (msg === "給建議") { db.setPending(userId, "feedback"); return reply(event, V.feedbackAsk()); }
    if (msg === "菜單") return reply(event, V.menu());
    if (msg === "使用說明" || msg === "說明") return reply(event, V.help());
    const result = answerFromKnowledge(msg, store);
    if (result?.type === "menu") return reply(event, V.menu());
    if (result) return reply(event, V.faq(result.title, result.body, result.url));
    const intent = classifyIntent(msg);
    if (intent === "reservation") return onText(event, userId, "訂位");
    if (intent === "handoff") return onText(event, userId, "真人客服");
    if (intent === "feedback") return onText(event, userId, "給建議");
    if (ai) {
      const aiResult = await ai.answer({ userId, question: msg, restaurant: store });
      if (aiResult.kind === "answer") return reply(event, text(aiResult.text, MAIN_RAIL));
      return reply(event, text(aiResult.text, MAIN_RAIL));
    }
    return reply(event, V.unknown());
  }
  return { handleEvent, stores: [store], store, config };
}
