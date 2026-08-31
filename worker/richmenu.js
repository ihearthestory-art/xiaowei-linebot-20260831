// 圖文選單：按一個鍵就上線，不用在 LINE 後台一格一格手畫。
//
// 為什麼要做成程式：
//   後台的手動流程要先自己畫一張 2500×1686 的圖、上傳、再拉六個框、
//   每個框填一段文字。70 個人平均 15 分鐘，而且拉歪的框事後看不出來，
//   要等客人點錯才發現。程式做只要三個 API 呼叫，框的座標是算出來的，不會歪。
//
// 三步驟（LINE 規定的順序，不能顛倒）：
//   1. POST /richmenu            送版型（尺寸、六個框的座標、點下去送什麼字）→ 拿到 richMenuId
//   2. POST /richmenu/{id}/content  送圖片本體（走 api-data 網域，不是一般 API 網域）
//   3. POST /user/all/richmenu/{id} 設成全體預設，這一步做完才會出現在客人手機上
//
// 每格點下去送出的文字，必須跟 src/app.js 的 MENU_WORDS 一模一樣，bot 才認得。
const API = "https://api.line.me/v2/bot";
const API_DATA = "https://api-data.line.me/v2/bot";

const W = 2500;
const H = 1686;
const COLS = 3;
const ROWS = 2;

// 順序＝手機上由左到右、由上到下，跟 tools/make_richmenu_image.py 的 CELLS 必須一致。
// 改這裡就要改那裡，否則圖上寫「菜單」的格子會送出別的字。
export const LABELS = ["菜單", "營業時間", "怎麼去", "訂位", "使用說明", "真人客服"];

/** 把畫面切成 3×2，算出六個框的座標。最後一欄/列補足除不盡的餘數，不留縫。 */
export function buildAreas(labels = LABELS) {
  const cw = Math.floor(W / COLS);
  const ch = Math.floor(H / ROWS);
  return labels.map((label, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    return {
      bounds: {
        x: col * cw,
        y: row * ch,
        width: col === COLS - 1 ? W - col * cw : cw,
        height: row === ROWS - 1 ? H - row * ch : ch,
      },
      // message action：點下去等於客人自己打了那四個字，走的是 bot 既有的路由，
      // 不必為選單另寫一套處理邏輯。
      action: { type: "message", label: label.slice(0, 20), text: label },
    };
  });
}

export function buildRichMenu({ chatBarText = "點這裡", name = "主選單", labels } = {}) {
  return {
    size: { width: W, height: H },
    selected: true,            // 客人一加好友就把選單展開，不用自己去點
    name: name.slice(0, 300),
    chatBarText: chatBarText.slice(0, 14),   // LINE 上限 14 字
    areas: buildAreas(labels),
  };
}

export function chooseRichMenuImage(customImage, defaultImage) {
  return customImage?.image || defaultImage;
}

/**
 * 建立並啟用圖文選單。回傳 { richMenuId, replaced }。
 *
 * @param token      該學員自己的 channel access token
 * @param imageBytes 2500×1686 的 JPEG（ArrayBuffer / Uint8Array），須 <1MB
 */
export async function deployRichMenu(token, imageBytes, opts = {}) {
  const auth = { authorization: `Bearer ${token}` };

  async function api(method, path, payload, base = API) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: payload ? { ...auth, "content-type": "application/json" } : auth,
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const txt = await res.text().catch(() => "");
    if (!res.ok) throw new Error(`LINE ${method} ${path} ${res.status}: ${txt.slice(0, 300)}`);
    try {
      return txt ? JSON.parse(txt) : {};
    } catch {
      return {};
    }
  }

  // 先記下舊的，成功之後再刪。順序反過來的話，中途失敗會讓學員兩個選單都沒有。
  const before = await api("GET", "/richmenu/list").catch(() => ({ richmenus: [] }));

  const { richMenuId } = await api("POST", "/richmenu", buildRichMenu(opts));

  // D1 讀回的自訂底圖是 number[]，直接當 fetch body 會上傳失敗（實測回 503／空 body）。
  // 打包的預設圖是 ArrayBuffer，本來就正常；統一轉成位元組陣列，兩種來源都上傳得成功。
  const imageBody = (imageBytes instanceof ArrayBuffer || ArrayBuffer.isView(imageBytes)) ? imageBytes : new Uint8Array(imageBytes);
  const up = await fetch(`${API_DATA}/richmenu/${richMenuId}/content`, {
    method: "POST",
    headers: { ...auth, "content-type": "image/jpeg" },
    body: imageBody,
  });
  if (!up.ok) {
    const detail = await up.text().catch(() => "");
    // 圖片上傳失敗就把剛建的空選單收掉，不要在學員帳號留一堆沒有圖的殘骸
    await api("DELETE", `/richmenu/${richMenuId}`).catch(() => {});
    throw new Error(`上傳選單圖片失敗 ${up.status}: ${detail.slice(0, 300)}`);
  }

  await api("POST", `/user/all/richmenu/${richMenuId}`);

  // 舊選單刪掉，免得撞到每個帳號 1000 個的上限，也免得學員自己看列表時搞混
  let replaced = 0;
  for (const m of before.richmenus || []) {
    if (m.richMenuId === richMenuId) continue;
    await api("DELETE", `/richmenu/${m.richMenuId}`).catch(() => {});
    replaced += 1;
  }

  return { richMenuId, replaced };
}
