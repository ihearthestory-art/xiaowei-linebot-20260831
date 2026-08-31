import { V } from "./src/views.js";

export const STATUS = { live: "可示範", todo: "下一階段" };
export const meta = {
  title: "小微餐館 LINE Bot 功能總覽",
  intro: "型錄直接用 Bot 實際的訊息元件渲染，讓課程示範與程式行為一致。",
  metaLine: ["示範帳號：待設定", "Webhook：待部署", `產出日期：${new Date().toISOString().slice(0, 10)}`],
  avatar: "餐",
  legend: [[STATUS.live, "本機已測試"], [STATUS.todo, "需另行授權與串接"]],
  richMenu: {
    cols: 3,
    lead: "六格選單：常見資訊優先，涉及確認或例外情況立即轉真人。",
    cells: [["菜單", "送出「菜單」", "☰"], ["營業時間", "送出「營業時間」", "◷"], ["訂位", "送出「訂位」", "◎"], ["怎麼去", "送出「怎麼去」", "⌖"], ["真人客服", "送出「真人客服」", "◉"], ["給建議", "送出「給建議」", "✎"]],
    notes: ["訂位只收集需求，店員確認前不代表成功。", "過敏原、客訴與未確認資訊不由 Bot 猜測。"],
  },
};

export const sections = [
  { title: "餐館查詢", lead: "只回答店家已確認的資料。", items: [
    { name: "歡迎與入口", tag: "follow", status: STATUS.live, desc: "加好友後顯示可做的事情。", msgs: () => [V.welcome()] },
    { name: "菜單", tag: "菜單", status: STATUS.live, desc: "示範今日品項與過敏原轉人工。", msgs: () => [V.menu()] },
    { name: "營業與地點", tag: "營業時間／怎麼去", status: STATUS.live, desc: "用已確認資料回覆。", msgs: () => [V.faq("營業時間", "每日 11:30–14:00、17:00–21:00")] },
  ]},
  { title: "服務處理", lead: "留單、轉人、可追蹤。", items: [
    { name: "訂位需求", tag: "訂位", status: STATUS.live, desc: "依序收集時間、人數、稱呼，建立 pending 案件。", msgs: () => [V.reservationTime()] },
    { name: "真人客服", tag: "真人客服", status: STATUS.live, desc: "建立人工案件，下一則訊息補充問題。", msgs: () => [V.handoff({ id: 1 })] },
    { name: "回饋分流", tag: "給建議", status: STATUS.live, desc: "負向關鍵字標為優先處理。", msgs: () => [V.feedbackAsk()] },
  ]},
  { title: "下一階段 AI", lead: "須先決定模型供應商與資料治理方式。", items: [
    { name: "知識庫問答", tag: "AI（規劃）", status: STATUS.todo, desc: "只引用核可知識，答不出來轉真人。", msgs: () => [V.unknown()] },
  ]},
];

export async function prepare() {}
