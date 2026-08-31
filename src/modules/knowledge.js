// 餐廳知識庫：先以可審核的規則回答，之後才把 AI 接在最後一層。
// AI 不可自行編造營業、過敏原、訂位成功與折扣；這些資料只能來自店家資料（restaurant.json 或該租戶自己填的）或店員。
import restaurant from "../seed/restaurant.json" with { type: "json" };

const has = (text, words) => words.some((w) => text.includes(w));

export function classifyIntent(input = "") {
  const text = String(input).replace(/\s+/g, "").toLowerCase();
  if (has(text, ["訂位", "訂桌", "預約", "幾位"])) return "reservation";
  if (has(text, ["店員", "真人", "客服", "老闆", "人工"])) return "handoff";
  if (has(text, ["抱怨", "客訴", "難吃", "等太久", "服務差", "異味", "錯單", "少了", "建議", "意見"])) return "feedback";
  if (has(text, ["幾點", "營業", "公休", "開了嗎", "今天有開"])) return "hours";
  if (has(text, ["地址", "怎麼去", "停車", "在哪"])) return "location";
  if (has(text, ["菜單", "推薦", "吃什麼", "招牌", "價錢", "多少錢"])) return "menu";
  if (has(text, ["過敏", "花生", "甲殼", "素食", "不吃"])) return "allergen";
  return "unknown";
}

/**
 * 店家自己加的問答（store.faq）。排在內建規則之前，因為那是店家親手寫的，
 * 一定比通用規則準。格式：[{ keywords: ["停車","車位"], answer: "門口不能停…" }]
 * 比對方式故意做得寬鬆：客人打「有停車嗎」也要命中「停車」。
 */
function answerFromCustomFaq(input, store) {
  const text = String(input).replace(/\s+/g, "").toLowerCase();
  for (const [faqIndex, item] of (Array.isArray(store?.faq) ? store.faq : []).entries()) {
    const words = Array.isArray(item.keywords) ? item.keywords : [];
    if (words.some((w) => w && text.includes(String(w).replace(/\s+/g, "").toLowerCase()))) {
      return { type: "faq", title: item.title || "店家說明", body: item.answer, faqIndex, video: Boolean(item.video) };
    }
  }
  return null;
}

export function answerFromKnowledge(input, store = restaurant) {
  const custom = answerFromCustomFaq(input, store);
  if (custom) return custom;
  switch (classifyIntent(input)) {
    case "hours": return { type: "faq", title: "營業時間", body: `${store.hours}\n${store.closed}` };
    case "location": return { type: "location", title: "地址與交通", body: store.address, url: store.mapUrl };
    case "menu": return { type: "menu" };
    case "allergen": return { type: "allergen", title: "過敏原與飲食需求", body: store.allergens };
    default: return null;
  }
}

export function sentimentOf(input = "") {
  const text = String(input);
  return has(text, ["難吃", "等太久", "服務差", "冷掉", "錯單", "少了", "異味", "食物中毒", "嘔吐", "拉肚子", "不開心"]) ? "urgent" : "normal";
}

export { restaurant };
