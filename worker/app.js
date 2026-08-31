// 對話流程（Workers 版）。跟 src/app.js 同一套邏輯，差別只在 D1 是 async，
// 所有 db 呼叫都要 await。卡片與知識庫直接沿用 src/ 底下那幾支（它們沒有 node 相依）。
import { createViews, MAIN_RAIL } from "../src/views.js";
import { text } from "../src/line/cards.js";
import { answerFromKnowledge, classifyIntent, restaurant, sentimentOf } from "../src/modules/knowledge.js";
import { createGeminiAssistant } from "../src/modules/gemini.js";

const MENU_WORDS = new Set([
  "菜單", "營業時間", "怎麼去", "訂位", "真人客服", "給建議", "使用說明", "過敏原", "取消",
]);

export function createApp({ line, db, config, log = console, store = restaurant }) {
  const V = createViews(store);
  const ai = createGeminiAssistant({ config, db: null, log });   // Workers 版先不做每日額度計數
  const seen = new Set();
  const reply = (event, messages) =>
    line.replyOrPush(event.replyToken, event.source?.userId,
                     Array.isArray(messages) ? messages : [messages], log);

  async function handleEvent(event) {
    if (event.webhookEventId) {
      if (seen.has(event.webhookEventId)) return;
      seen.add(event.webhookEventId);
    }
    const userId = event.source?.userId;
    if (!userId) return;
    try {
      if (event.type === "follow") return await reply(event, V.welcome());
      if (event.type === "postback") return await reply(event, V.unknown());
      if (event.type === "message" && event.message?.type === "image") {
        return await reply(event, text("收到圖片。菜單、收據或食物問題目前請由真人客服確認。", MAIN_RAIL));
      }
      if (event.type === "message" && event.message?.type === "text") {
        return await onText(event, userId, String(event.message.text).trim());
      }
    } catch (e) {
      log.error?.("[event]", e.message);
      return reply(event, V.error());
    }
  }

  /** 這句話是被哪條規則接走的。只用來做紀錄，不影響回覆。（對齊 src/app.js） */
  function matchedRule(msg) {
    if (MENU_WORDS.has(msg)) return msg;
    const k = answerFromKnowledge(msg, store);
    if (k) return k.type === "faq" ? `faq:${k.title}` : k.type;
    return classifyIntent(msg) || "unknown";
  }

  async function onText(event, userId, msg) {
    if (msg === "看影片") return reply(event, store.videoUrl ? V.video() : V.videoUnavailable());
    const pending = await db.getPending(userId);
    // 只記客人主動問的問題（訂位/給建議流程中的姓名、內容不記，那些含個資另存）。
    // 這段在 Workers 版原本漏掉，導致 questions.csv／沉睡客分析全空——補回。
    if (!pending && msg !== "取消") {
      try { await db.logMessage?.(userId, msg, matchedRule(msg)); }
      catch (e) { log.error?.("[logMessage]", e.message); }
    }
    if (msg === "取消" && pending) {
      await db.clearPending(userId);
      return reply(event, text("已取消，想做什麼可從下方選單開始。", MAIN_RAIL));
    }
    if (pending && !MENU_WORDS.has(msg)) {
      const p = pending.payload || {};
      if (pending.mode === "reservation_time") {
        await db.setPending(userId, "reservation_party", { ...p, requestedAt: msg });
        return reply(event, V.reservationParty());
      }
      if (pending.mode === "reservation_party") {
        await db.setPending(userId, "reservation_name", { ...p, partySize: msg });
        return reply(event, V.reservationName());
      }
      if (pending.mode === "reservation_name") {
        await db.clearPending(userId);
        const r = await db.createReservation(userId, { ...p, contactName: msg });
        return reply(event, V.reservationReceived(r));
      }
      if (pending.mode === "feedback") {
        await db.clearPending(userId);
        const f = await db.createFeedback(userId, msg, sentimentOf(msg));
        return reply(event, V.feedbackSaved(f));
      }
      if (pending.mode === "handoff") {
        await db.clearPending(userId);
        await db.updateHandoff(p.id, userId, msg);
        return reply(event, text("已補上你的問題，店員會接續處理。", MAIN_RAIL));
      }
    }
    if (msg === "訂位") {
      await db.setPending(userId, "reservation_time");
      return reply(event, V.reservationTime());
    }
    if (msg === "真人客服") {
      const t = await db.createHandoff(userId, "等待客人補充問題");
      await db.setPending(userId, "handoff", { id: t.id });
      return reply(event, V.handoff(t));
    }
    if (msg === "給建議") {
      await db.setPending(userId, "feedback");
      return reply(event, V.feedbackAsk());
    }
    if (msg === "菜單") return reply(event, V.menu());
    if (msg === "使用說明" || msg === "說明") return reply(event, V.help());

    const result = answerFromKnowledge(msg, store);
    if (result?.type === "menu") return reply(event, V.menu());
    if (result) {
      if (result.video) return reply(event, store.videoUrl ? V.video() : V.videoUnavailable());
      const image = result.type === "faq" && Number.isInteger(result.faqIndex) && db.getFaqImage
        ? await db.getFaqImage(result.faqIndex) : null;
      const imageUrl = image ? `${store.imageBaseUrl}/img/${store.id}/${result.faqIndex}` : null;
      return reply(event, V.faq(result.title, result.body, result.url, imageUrl));
    }

    const intent = classifyIntent(msg);
    if (intent === "reservation") return onText(event, userId, "訂位");
    if (intent === "handoff") return onText(event, userId, "真人客服");
    if (intent === "feedback") return onText(event, userId, "給建議");

    if (ai) {
      const r = await ai.answer({ userId, question: msg, restaurant: store });
      return reply(event, text(r.text, MAIN_RAIL));
    }
    return reply(event, V.unknown());
  }

  return { handleEvent, store };
}
