// Flex 卡片的原子元件庫。views.js 只組合這些函式，不自己寫 Flex JSON。
// LINE 不會替 Flex 做深淺模式轉色，每個 text／box 都要顯式給顏色，否則深色模式會糊掉。
//
// ★ 換配色只改下面這張 T 色票表，其餘檔案一行都不用動。★

export const T = {
  brand: "#1F3A5F", // 深色：卡片 header 底
  brandMid: "#2E6FB7", // 主行動按鈕 / 正向
  brandSoft: "#E4EEF8", // 正向淡底
  surface: "#F7F8FA", // 卡片 body 底
  white: "#FFFFFF",
  ink: "#1B2430", // 主文字
  muted: "#6B7684", // 說明文字
  line: "#E2E6EC", // 分隔線
  accent: "#C9922A", // 強調 / 待確認
  accentSoft: "#F7EEDA",
  danger: "#B54235", // 錯誤 / 負向
  dangerSoft: "#F7E4E1",
  grey: "#8A9098", // 中性
  headerFg: "#FFFFFF",
  headerDim: "#CDD8E4",
};

// LINE 平台硬限制：按鈕 label 最長 20 字、altText（推播列文字）最長 400 字，超過會整則被退件
const LABEL_MAX = 20;
const ALT_MAX = 400;

/** 卡片殼：header（標題 + 副標）+ body（+ 可選 hero 圖 / footer 按鈕區） */
export function shell({ title, subtitle = null, contents = [], footer = null, headerColor = T.brand, size = "mega", hero = null }) {
  const header = {
    type: "box",
    layout: "vertical",
    paddingAll: "18px",
    backgroundColor: headerColor,
    contents: [{ type: "text", text: title, weight: "bold", size: "lg", color: T.headerFg, wrap: true }],
  };
  if (subtitle) header.contents.push({ type: "text", text: subtitle, size: "xs", color: T.headerDim, margin: "xs", wrap: true });

  const bubble = {
    type: "bubble",
    size,
    header,
    body: { type: "box", layout: "vertical", paddingAll: "18px", backgroundColor: T.surface, contents },
    styles: {
      header: { backgroundColor: headerColor },
      body: { backgroundColor: T.surface },
      footer: { backgroundColor: T.surface, separator: true, separatorColor: T.line },
    },
  };
  if (hero?.url) {
    bubble.hero = { type: "image", url: hero.url, size: "full", aspectRatio: hero.aspectRatio || "16:9", aspectMode: "cover" };
  }
  if (footer && footer.length) {
    bubble.footer = { type: "box", layout: "vertical", spacing: "sm", paddingAll: "14px", backgroundColor: T.surface, contents: footer };
  }
  return bubble;
}

/** postback 按鈕：按了送 data 回 webhook，不會在聊天室留下使用者訊息（除非給 displayText） */
export function btn(label, data, { primary = false, displayText = null } = {}) {
  const b = {
    type: "button",
    style: primary ? "primary" : "secondary",
    height: "sm",
    adjustMode: "shrink-to-fit",
    action: { type: "postback", label: cut(label), data, displayText: displayText === null ? cut(label) : displayText || undefined },
  };
  if (primary) b.color = T.brandMid;
  return b;
}

/** message 按鈕：按了等於使用者自己打了那句話 */
export function msgBtn(label, text, primary = false) {
  const b = { type: "button", style: primary ? "primary" : "secondary", height: "sm", adjustMode: "shrink-to-fit", action: { type: "message", label: cut(label), text } };
  if (primary) b.color = T.brandMid;
  return b;
}

/** 開外部網頁 */
export function uriBtn(label, uri, primary = false) {
  const b = { type: "button", style: primary ? "primary" : "secondary", height: "sm", adjustMode: "shrink-to-fit", action: { type: "uri", label: cut(label), uri } };
  if (primary) b.color = T.brandMid;
  return b;
}

/** 開鍵盤並預填一段文字（讓使用者接著打後半段，例如「開通 」） */
export function inputBtn(label, fillInText, primary = false) {
  const b = {
    type: "button",
    style: primary ? "primary" : "secondary",
    height: "sm",
    adjustMode: "shrink-to-fit",
    action: { type: "postback", label: cut(label), data: `noop:${fillInText}`, inputOption: "openKeyboard", fillInText },
  };
  if (primary) b.color = T.brandMid;
  return b;
}

/** 複製到剪貼簿（LINE 14.0+，舊版客戶端會忽略這個按鈕） */
export function clipboardBtn(label, clipboardText) {
  return { type: "button", style: "secondary", height: "sm", adjustMode: "shrink-to-fit", action: { type: "clipboard", label: cut(label), clipboardText: String(clipboardText).slice(0, 1000) } };
}

/** 把數顆按鈕排成一列（等寬） */
export function btnRow(buttons, margin = "md") {
  return { type: "box", layout: "horizontal", spacing: "sm", margin, contents: buttons.map((b) => ({ ...b, flex: 1 })) };
}

/** 左標右值的一行 */
export function kvRow(label, value, { margin = "sm", valueColor = T.ink } = {}) {
  return {
    type: "box",
    layout: "horizontal",
    margin,
    contents: [
      { type: "text", text: label, size: "sm", color: T.muted, flex: 3, wrap: true },
      { type: "text", text: String(value ?? "—"), size: "sm", color: valueColor, weight: "bold", flex: 5, wrap: true, align: "end" },
    ],
  };
}

export function sectionTitle(text, margin = "lg") {
  return { type: "text", text, size: "sm", weight: "bold", color: T.brandMid, margin, wrap: true };
}
export function bodyText(text, margin = "md", color = T.ink) {
  return { type: "text", text, size: "sm", color, margin, wrap: true };
}
export function dimText(text, margin = "sm") {
  return { type: "text", text, size: "xs", color: T.muted, margin, wrap: true };
}
export function bigNumber(text, color = T.ink, margin = "md") {
  return { type: "text", text: String(text), size: "xxl", weight: "bold", color, margin };
}
export function separator(margin = "md") {
  return { type: "separator", margin, color: T.line };
}

/** 小標籤（膠囊）：tone = pos / neg / accent / neutral */
export function pill(text, tone = "neutral") {
  const map = { pos: [T.brandSoft, T.brandMid], neg: [T.dangerSoft, T.danger], accent: [T.accentSoft, "#8A6A1E"], neutral: ["#ECEEF1", T.muted] };
  const [bg, fg] = map[tone] || map.neutral;
  return {
    type: "box",
    layout: "vertical",
    backgroundColor: bg,
    cornerRadius: "10px",
    paddingTop: "3px",
    paddingBottom: "3px",
    paddingStart: "8px",
    paddingEnd: "8px",
    flex: 0,
    contents: [{ type: "text", text: cut(text, 14), size: "xxs", color: fg, weight: "bold" }],
  };
}
export function pillRow(items, margin = "sm") {
  return { type: "box", layout: "horizontal", spacing: "xs", margin, contents: items.slice(0, 4) };
}

/** 左右兩色比例條。Flex 畫不了圖表，比例條是最便宜的替代 */
export function ratioBar(pos, neg, margin = "md") {
  const total = Math.max(1, pos + neg);
  const p = Math.round((pos / total) * 100);
  return {
    type: "box",
    layout: "horizontal",
    height: "10px",
    cornerRadius: "5px",
    margin,
    backgroundColor: T.line,
    contents: [
      { type: "box", layout: "vertical", flex: Math.max(1, p), backgroundColor: T.brandMid, contents: [] },
      { type: "box", layout: "vertical", flex: Math.max(1, 100 - p), backgroundColor: T.danger, contents: [] },
    ],
  };
}

/** 排行列：名次 + 名稱 + 數量 */
export function rankRow(idx, name, count, tone = "neutral", unit = "次") {
  const color = tone === "neg" ? T.danger : tone === "pos" ? T.brandMid : T.ink;
  return {
    type: "box",
    layout: "horizontal",
    margin: "sm",
    contents: [
      { type: "text", text: String(idx).padStart(2, "0"), size: "sm", color: T.muted, flex: 1 },
      { type: "text", text: name, size: "sm", color: T.ink, flex: 6, wrap: true },
      { type: "text", text: `${count} ${unit}`, size: "sm", color, weight: "bold", flex: 2, align: "end" },
    ],
  };
}

// ---- 訊息外殼（送到 LINE 的最外層物件）----
export function flex(altText, bubble, quickReply = null) {
  const m = { type: "flex", altText: String(altText).slice(0, ALT_MAX), contents: bubble };
  if (quickReply) m.quickReply = quickReply;
  return m;
}
export function carousel(altText, bubbles, quickReply = null) {
  const m = { type: "flex", altText: String(altText).slice(0, ALT_MAX), contents: { type: "carousel", contents: bubbles.slice(0, 12) } };
  if (quickReply) m.quickReply = quickReply;
  return m;
}
export function text(t, quickReply = null) {
  const m = { type: "text", text: String(t).slice(0, 5000) };
  if (quickReply) m.quickReply = quickReply;
  return m;
}

// ---- Quick Reply 快捷列：每則訊息底部最多 13 顆 ----
export const qr = {
  make(items) {
    return { items: items.slice(0, 13) };
  },
  msg(label, text = label) {
    return { type: "action", action: { type: "message", label: cut(label), text } };
  },
  postback(label, data, displayText = label) {
    return { type: "action", action: { type: "postback", label: cut(label), data, displayText } };
  },
  /** 一鍵開相機／相簿只能放在 Quick Reply，卡片按鈕做不到 */
  camera(label = "拍照上傳") {
    return { type: "action", action: { type: "camera", label: cut(label) } };
  },
  cameraRoll(label = "從相簿選") {
    return { type: "action", action: { type: "cameraRoll", label: cut(label) } };
  },
};

/** label 超過上限就截斷加省略號，避免整則訊息被 LINE 退件 */
function cut(s, n = LABEL_MAX) {
  s = String(s ?? "");
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
