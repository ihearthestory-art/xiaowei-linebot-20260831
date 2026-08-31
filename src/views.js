import { T, shell, btnRow, bodyText, dimText, kvRow, msgBtn, pill, pillRow, qr, flex, carousel, text, uriBtn, separator, sectionTitle } from "./line/cards.js";
import { restaurant } from "./modules/knowledge.js";

export const MAIN_RAIL = qr.make([qr.msg("菜單"), qr.msg("營業時間"), qr.msg("怎麼去"), qr.msg("訂位"), qr.msg("真人客服"), qr.msg("給建議")]);
const actions = () => [btnRow([msgBtn("菜單", "菜單", true), msgBtn("營業時間", "營業時間")]), btnRow([msgBtn("怎麼去", "怎麼去"), msgBtn("訂位", "訂位", true)]), btnRow([msgBtn("真人客服", "真人客服"), msgBtn("給建議", "給建議")])];

// 卡片工廠：把店家資料當參數傳進來，多租戶時每位學員的帳號回自己的店名與菜單。
// 舊的 V 保留成「用預設示範餐館」的實例，測試與功能總覽照舊可用。
export function createViews(store = restaurant) {
  return {
  welcome: () => flex("歡迎來到小微示範小館", shell({ title: store.name, subtitle: "查詢、訂位、真人接手", contents: [bodyText("直接問問題，或從下方選單開始。訂位需求由店員確認後才成立。"), separator(), sectionTitle("最快找到答案"), dimText("菜單／營業時間／怎麼去／訂位／真人客服／給建議")], footer: actions(), headerColor: T.brand }), MAIN_RAIL),
  menu: () => flex("小微小館菜單", shell({ title: "今日菜單", subtitle: "示範資料，實際品項由店家更新", hero: store.menuImageUrl ? { url: store.menuImageUrl } : null, contents: [...store.menu.flatMap((i) => i.tag ? [kvRow(i.name, i.price), pillRow([pill(i.tag, i.tag === "限量" ? "accent" : "pos")])] : [kvRow(i.name, i.price)]), separator(), dimText("有過敏原或特殊飲食需求，請點「真人客服」確認。")], footer: [btnRow([msgBtn("我要訂位", "訂位", true), msgBtn("過敏原說明", "過敏原")])] }), MAIN_RAIL),
  faq: (title, body, url = null, imageUrl = null) => flex(title, shell({ title, subtitle: store.short, contents: [bodyText(body)], hero: imageUrl ? { url: imageUrl } : null, footer: url ? [btnRow([uriBtn("開啟地圖", url, true), msgBtn("我要訂位", "訂位")])] : actions() }), MAIN_RAIL),
  video: () => ({ type: "video", originalContentUrl: store.videoUrl, previewImageUrl: store.videoPreviewUrl || `${store.imageBaseUrl}/img/${store.id}/default` }),
  videoUnavailable: () => text("這間店目前還沒有設定影片，請先看看菜單或直接詢問店家。", MAIN_RAIL),
  reservationTime: () => text("想訂哪一天、幾點？例如：週六 18:30。\n\n這是訂位需求收集，店員確認前不代表訂位成功。", qr.make([qr.msg("取消"), qr.msg("營業時間"), qr.msg("真人客服")])),
  reservationParty: () => text("幾位用餐？直接回覆人數即可，例如：4 位。", qr.make([qr.msg("取消"), qr.msg("真人客服")])),
  reservationName: () => text("請留訂位姓名或稱呼。送出後店員會確認是否保留座位。", qr.make([qr.msg("取消"), qr.msg("真人客服")])),
  reservationReceived: (r) => flex("已收到訂位需求", shell({ title: "等待店員確認", subtitle: `案件 #${r.id}`, contents: [kvRow("時間", r.requestedAt), kvRow("人數", r.partySize), kvRow("稱呼", r.contactName), separator(), pillRow([pill("尚未確認", "accent")]), dimText(store.reservationNote)], footer: [btnRow([msgBtn("真人客服", "真人客服", true), msgBtn("回主選單", "使用說明")])] }), MAIN_RAIL),
  handoff: (t) => flex("已通知店員", shell({ title: "真人客服接手", subtitle: `案件 #${t.id}`, contents: [bodyText("請直接輸入你的問題；我們會把下一則訊息附到案件中。緊急用餐問題請直接來電。"), ...(store.phone ? [kvRow("電話", store.phone)] : []), pillRow([pill("等待回覆", "accent")])], footer: [btnRow([msgBtn("給建議", "給建議"), msgBtn("回主選單", "使用說明")])] }), MAIN_RAIL),
  feedbackAsk: () => text("請直接寫下你的建議或遇到的問題。我們會交給店員處理；若是緊急客訴，請一併留下用餐時間。", qr.make([qr.msg("取消"), qr.msg("真人客服")])),
  feedbackSaved: (t) => flex("謝謝你的回饋", shell({ title: "已建立處理單", subtitle: `案件 #${t.id}`, contents: [pillRow([pill(t.priority === "urgent" ? "優先處理" : "已收到", t.priority === "urgent" ? "neg" : "pos")]), dimText("店員會依內容確認處理方式；請勿在聊天室傳信用卡、證件或其他敏感資料。")], footer: [btnRow([msgBtn("真人客服", "真人客服", true), msgBtn("回主選單", "使用說明")])] }), MAIN_RAIL),
  help: () => carousel("使用說明", [shell({ title: "1｜先查資料", subtitle: "不用等店員", contents: [bodyText("直接打「營業時間」「菜單」「怎麼去」；Bot 會用店家已確認的資料回答。")], footer: [msgBtn("看菜單", "菜單", true)] }), shell({ title: "2｜留下訂位需求", subtitle: "不是自動保留座位", contents: [bodyText("依序填時間、人數、稱呼，系統建立待確認案件。店員確認後才算訂位成功。")], footer: [msgBtn("開始訂位", "訂位", true)] }), shell({ title: "3｜需要人就轉人", subtitle: "AI 不知道就別猜", contents: [bodyText("過敏原、客訴、訂位異動或不在知識庫的問題，請點真人客服。")], footer: [msgBtn("真人客服", "真人客服", true)] })], MAIN_RAIL),
  unknown: () => text("我還不確定你的意思。你可以問「營業時間」「菜單」「怎麼去」，或點「真人客服」。", MAIN_RAIL),
  error: () => flex("系統忙碌", shell({ title: "請再試一次", contents: [bodyText("目前無法完成這個動作，請稍後再試或改由真人客服處理。")], headerColor: T.danger }), MAIN_RAIL),
  };
}

export const V = createViews();

