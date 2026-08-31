// 學員報名頁：把「開好自己的 LINE 官方帳號 → 貼兩把鑰匙 → 拿到自己的 Webhook 網址」
// 縮成一個表單。學員不必部署、不必碰環境變數、不必裝任何東西。
//
// 頁面刻意做成一頁到底、大字、少欄位：使用者是 40–65 歲的餐館老闆，
// 多一個欄位就多一個放棄的理由。
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const CSS = `
:root{--g:#06C755;--ink:#1A1A1A;--soft:#5A5A5A;--line:#E2DED5;--bg:#F4F1EA}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
     font-family:"Noto Sans TC","PingFang TC","Microsoft JhengHei",system-ui,sans-serif;
     line-height:1.7;font-size:18px}
.wrap{max-width:640px;margin:0 auto;padding:28px 20px 60px}
h1{font-size:30px;margin:0 0 6px}
h2{font-size:22px;margin:32px 0 10px}
p.lead{color:var(--soft);margin:0 0 24px}
label{display:block;font-weight:700;margin:20px 0 6px}
label small{display:block;font-weight:400;color:var(--soft);font-size:15px;margin-top:2px}
input,textarea{width:100%;padding:14px;font-size:18px;border:2px solid var(--line);
               border-radius:8px;background:#fff;font-family:inherit}
input:focus,textarea:focus{outline:none;border-color:var(--g)}
button{width:100%;margin-top:26px;padding:16px;font-size:20px;font-weight:700;color:#fff;
       background:var(--g);border:0;border-radius:8px;cursor:pointer}
.box{background:#fff;border:2px solid var(--line);border-radius:10px;padding:16px 18px;margin:18px 0}
.box.ok{border-color:var(--g)}
.box.warn{border-color:#E85D2C;background:#FFF6F2}
code{background:#EDE8DC;padding:3px 8px;border-radius:5px;font-size:16px;word-break:break-all}
.url{display:block;background:var(--ink);color:#fff;padding:14px;border-radius:8px;
     font-size:17px;word-break:break-all;margin:8px 0}
ol{padding-left:22px}li{margin:8px 0}
.err{color:#C0392B;font-weight:700}
`;

function page(title, body) {
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>${CSS}</style></head>
<body><div class="wrap">${body}</div><script>
async function compressImage(file, maxBytes, targetWidth, targetHeight) {
  var source = await createImageBitmap(file);
  var canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight || Math.round(source.height * targetWidth / source.width);
  var scale = Math.max(canvas.width / source.width, canvas.height / source.height);
  var w = source.width * scale, h = source.height * scale;
  canvas.getContext('2d').drawImage(source, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  var quality = 0.92, blob;
  while (quality >= 0.1) {
    blob = await new Promise(function(resolve) { canvas.toBlob(resolve, 'image/jpeg', quality); });
    if (blob && blob.size <= maxBytes) return new File([blob], file.name.replace(/\\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
    quality -= 0.08;
  }
  throw new Error('圖片壓縮後仍超過限制，請換一張較簡單的圖片再試。');
}
function setCompressedInput(input, file) {
  var transfer = new DataTransfer(); transfer.items.add(file); input.files = transfer.files;
}
var faqButton = document.getElementById('build-faq-images');
if (faqButton) faqButton.addEventListener('click', function() {
  var box = document.getElementById('faq-image-fields'); box.replaceChildren();
  var lines = document.querySelector('[name=faq]').value.split('\\n').filter(function(line) { return line.indexOf('=') > 0; });
  lines.forEach(function(line, index) {
    var label = document.createElement('label'); label.textContent = 'FAQ 第 ' + (index + 1) + ' 條圖片（可不選）';
    var input = document.createElement('input'); input.type = 'file'; input.name = 'faqImage_' + index; input.accept = 'image/png,image/jpeg';
    label.appendChild(input); box.appendChild(label);
  });
});
var storeFormEl = document.getElementById('store-form');
if (storeFormEl) storeFormEl.addEventListener('submit', async function(event) {
  event.preventDefault();
  try {
    var inputs = storeFormEl.querySelectorAll('input[type=file]');
    for (var i = 0; i < inputs.length; i++) if (inputs[i].files[0]) setCompressedInput(inputs[i], await compressImage(inputs[i].files[0], 500 * 1024, 1080));
    storeFormEl.submit();
  } catch (error) { alert(error.message || '圖片處理失敗，請換一張圖片再試。'); }
});
var richForm = document.getElementById('richmenu-image-form');
if (richForm) richForm.addEventListener('submit', async function(event) {
  event.preventDefault();
  try {
    var input = richForm.querySelector('input[type=file]');
    if (!input.files[0]) throw new Error('請先選擇底圖。');
    setCompressedInput(input, await compressImage(input.files[0], 900 * 1024, 2500, 1686)); richForm.submit();
  } catch (error) { alert(error.message || '圖片處理失敗，請換一張圖片再試。'); }
});
</script></body></html>`;
}

export function joinForm({ error = "", values = {}, needClassCode = true } = {}) {
  return page("報名：接上我的 LINE 官方帳號", `
<h1>接上你的 LINE 官方帳號</h1>
<p class="lead">填完這一頁，你的官方帳號就會自己回客人的訊息。不用裝任何程式。</p>
${error ? `<div class="box warn"><span class="err">${esc(error)}</span></div>` : ""}
<div class="box">
  <b>填之前你要先有：</b>
  <ol>
    <li>你自己的 LINE 官方帳號（在 manager.line.biz 開的）</li>
    <li>已經按過「啟用 Messaging API」</li>
    <li>兩把鑰匙：Channel secret（短的）、Channel access token（很長的）</li>
  </ol>
</div>
<form method="post" action="/join">
  ${needClassCode ? `<label>課程通行碼
    <small>老師在投影片上給的那組。防止不相干的人亂填。</small>
    <input name="classCode" required value="${esc(values.classCode || "")}"></label>` : ""}
  <label>你的代號
    <small>英文小寫或數字，3–12 個字，例如 <code>ajia</code>、<code>shop07</code>。之後你的網址會用到它。</small>
    <input name="code" required minlength="3" maxlength="12" pattern="[a-z0-9-]+"
           placeholder="ajia" value="${esc(values.code || "")}"></label>
  <label>店名
    <small>客人會看到的名字。</small>
    <input name="name" required placeholder="阿嘉蚵仔麵線" value="${esc(values.name || "")}"></label>
  <label>Channel secret
    <small>LINE 官方帳號後台 → 設定 → Messaging API，那一串短的。</small>
    <input name="channelSecret" required autocomplete="off"></label>
  <label>Channel access token
    <small>LINE Developers Console → 你的 channel → Messaging API 分頁 → 最下面按「發行」，很長的那串。</small>
    <textarea name="channelAccessToken" required rows="4" autocomplete="off"></textarea></label>
  <button type="submit">送出，拿我的網址</button>
</form>
<div class="box">
  <b>關於安全，老實說：</b>
  你的兩把鑰匙會存在老師這台伺服器上，程式才能用你的帳號回訊息。
  課程結束後，回 LINE Developers Console 再按一次「發行」換一把新的，
  舊的立刻失效，這台伺服器就再也動不了你的帳號。
</div>`);
}

export function joinDone({ code, name, baseUrl }) {
  const hook = `${baseUrl}/webhook/${code}`;
  return page("完成：把網址填回 LINE", `
<h1>好了，剩最後一步</h1>
<p class="lead"><b>${esc(name)}</b>（代號 <code>${esc(code)}</code>）已經登記好。</p>
<div class="box ok">
  <b>把下面這串網址，複製到 LINE 後台的 Webhook 網址欄位：</b>
  <span class="url">${esc(hook)}</span>
  <ol>
    <li>回 manager.line.biz → 設定 → <b>Messaging API</b></li>
    <li>「Webhook 網址」貼上上面那串 → 儲存</li>
    <li>設定 → <b>回應設定</b>：Webhook <b>開</b>、自動回應訊息 <b>關</b></li>
    <li>用你自己的手機加好友，傳「營業時間」試試看</li>
  </ol>
</div>
<div class="box">
  <b>接下來可以改成你的店：</b>
  <span class="url">${esc(baseUrl)}/me/${esc(code)}</span>
  在那一頁填營業時間、地址、菜單，改完客人問「幾點開」就會回你的資料。
</div>`);
}

export function storeForm({ code, name, store, baseUrl, saved = false, menuId = "", menuErr = "" }) {
  const menuText = (store.menu || []).map((m) => `${m.name},${m.price}`).join("\n");
  const faqText = (store.faq || [])
    .map((f) => `${(f.keywords || []).join(",")} = ${f.answer || ""}${f.video ? " [影片]" : ""}`).join("\n");
  return page(`${name}：改成我的店`, `
<h1>改成你的店</h1>
<p class="lead">代號 <code>${esc(code)}</code>。改完按儲存，客人馬上就會收到新的內容。</p>
${saved ? '<div class="box ok"><b>已儲存。</b>拿你的手機傳「營業時間」測一次。</div>' : ""}
<form method="post" action="/me/${esc(code)}/store" enctype="multipart/form-data" id="store-form">
  <label>店名<input name="name" required value="${esc(store.name || name)}"></label>
  <label>營業時間
    <small>例：每日 11:30–14:00、17:00–21:00</small>
    <input name="hours" value="${esc(store.hours || "")}"></label>
  <label>公休<input name="closed" value="${esc(store.closed || "")}"></label>
  <label>地址<input name="address" value="${esc(store.address || "")}"></label>
  <label>Google 地圖網址
    <small>手機 Google 地圖搜你的店 → 分享 → 複製連結，貼上來。</small>
    <input name="mapUrl" value="${esc(store.mapUrl || "")}"></label>
  <label>電話<input name="phone" value="${esc(store.phone || "")}"></label>
  <label>菜單
    <small>一行一道：品名,價格。例：蚵仔麵線,65 元</small>
    <textarea name="menu" rows="6">${esc(menuText)}</textarea></label>
  <label>過敏原說明
    <small>不確定就寫「請店員確認」。這一項 Bot 不會自己編。</small>
    <input name="allergens" value="${esc(store.allergens || "")}"></label>
  <label>我的問答（客人問什麼，Bot 就回什麼）
    <small>一行一題，格式：<code>關鍵字,關鍵字,關鍵字 = 回答</code><br>
    例：<code>停車,車位,停哪 = 門口不能停，走兩分鐘有市民停車場，一小時 20 元。</code><br>
    關鍵字要寫<b>客人真的會打的字</b>。這一區的答案優先於系統內建的回答。</small>
    <textarea name="faq" rows="7">${esc(faqText)}</textarea></label>
  <div class="box">
    <b>FAQ 圖卡</b><br>
    先填好 FAQ 後按下方按鈕，每一題都可選一張圖片；送出前會在本機壓縮成 JPEG（每張不超過 500KB）。
    <div id="faq-image-fields"></div>
    <button type="button" id="build-faq-images">建立 FAQ 圖片欄位</button>
  </div>
  <label>影片直連網址
    <small>要 mp4 直連網址；還沒有就先空著</small>
    <input name="videoUrl" type="url" placeholder="https://example.com/intro.mp4" value="${esc(store.videoUrl || "")}"></label>
  <label>影片預覽圖網址
    <small>可留空，留空會使用 Bot 預設圖片</small>
    <input name="videoPreviewUrl" type="url" placeholder="https://example.com/preview.jpg" value="${esc(store.videoPreviewUrl || "")}"></label>
  <button type="submit">儲存</button>
</form>
<h2>客人問過什麼</h2>
<p class="lead">Bot 自己記的，你不用貼標籤、不用登記。開店一個月後這兩份檔案最有用。</p>
<div class="box">
  <a class="url" style="text-decoration:none" href="/me/${esc(code)}/questions.csv">下載：客人問過的每一句話</a>
  <b>怎麼用：</b>用 Excel 打開，先看「Bot 答出來了嗎」那欄寫「沒有」的幾列。
  那些就是客人真的會問、而你還沒教過它的問題——把答案填到上面的「我的問答」，
  下次客人問就答得出來了。
</div>
<div class="box">
  <a class="url" style="text-decoration:none" href="/me/${esc(code)}/customers.csv">下載：每位客人幾天沒來</a>
  <b>怎麼用：</b>「幾天沒來」超過你店的正常回訪間隔（小吃店大約 30 天、
  正餐店大約 45 天）的那幾位，就是該傳訊息喚回的人。這個數字是算出來的，
  不用你判斷、也不用你去點。
</div>

<h2>圖文選單</h2>
<p class="lead">客人打開你的 LINE，鍵盤上方那六格。按一次就好，不用自己畫圖、不用拉框。</p>
${menuId ? '<div class="box ok"><b>選單已經上線。</b>拿你的手機打開跟這個帳號的對話，'
  + '鍵盤上面會出現六格。點「營業時間」試試看。<br><small>選單編號 ' + esc(menuId) + '</small></div>' : ""}
${menuErr ? '<div class="box warn"><span class="err">產生失敗：' + esc(menuErr) + '</span><br>'
  + '最常見的原因是 Channel access token 貼錯或已經換過。回 /join 重填一次即可。</div>' : ""}
<form method="post" action="/me/${esc(code)}/richmenu-image" enctype="multipart/form-data" id="richmenu-image-form">
  <label>上傳選單底圖
    <small>選擇圖片後，瀏覽器會裁切為 2500×1686、轉 JPEG 並壓到 900KB 以下。</small>
    <input name="richMenuImage" type="file" accept="image/png,image/jpeg" required></label>
  <button type="submit">上傳選單底圖</button>
</form>
<form method="post" action="/me/${esc(code)}/richmenu">
  <button type="submit">產生我的六格選單</button>
</form>
<div class="box">
  <b>六格分別是：</b>菜單、營業時間、怎麼去、訂位、使用說明、真人客服。<br>
  客人點哪一格，等於他自己打了那四個字，Bot 就照你上面填的資料回答。<br>
  再按一次會用新資料重做一張，舊的自動刪掉。
</div>
<div class="box"><b>你的 Webhook 網址：</b><span class="url">${esc(baseUrl)}/webhook/${esc(code)}</span></div>`);
}

/** 把「關鍵字,關鍵字 = 回答」一行行解析成 faq 陣列。格式寫錯的行直接略過，不要讓 Bot 壞掉。 */
export function parseFaq(raw) {
  return String(raw || "").split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
    const i = line.indexOf("=");
    if (i < 1) return null;
    const keywords = line.slice(0, i).split(/[,，]/).map((k) => k.trim()).filter(Boolean);
    const rawAnswer = line.slice(i + 1).trim();
    const video = rawAnswer.endsWith("[影片]");
    const answer = video ? rawAnswer.slice(0, -4).trim() : rawAnswer;
    if (!keywords.length || !answer) return null;
    return { keywords, answer, title: keywords[0], video };
  }).filter(Boolean);
}

export function parseMenu(raw) {
  return String(raw || "").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const [name, price = ""] = l.split(/[,，]/);
    return { name: (name || "").trim(), price: price.trim(), tag: "" };
  }).filter((m) => m.name);
}
