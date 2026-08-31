// 功能總覽產生器：把 views.js 產出的 Flex JSON 渲染成 HTML 版的 LINE 對話框，
// 依 catalog.config.mjs 的分類排版成一份 A4 橫式文件（docs/catalog.html），再用 Chrome 轉 PDF。
// 圖是用 bot 的實際卡片程式碼畫的，不是另外做的圖，所以永遠跟程式一致。
//
// 用法：
//   npm run catalog                  產 HTML + PDF
//   node scripts/render-catalog.mjs --offline   不打任何外部 API（catalog.config.mjs 的 prepare 會收到 offline=true）
//   node scripts/render-catalog.mjs --no-pdf    只產 HTML
//   CHROME_PATH=... node scripts/render-catalog.mjs   指定 Chrome 執行檔
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
if (fs.existsSync(".env")) process.loadEnvFile(".env");

const OFFLINE = process.argv.includes("--offline");
const NO_PDF = process.argv.includes("--no-pdf");
const OUT_NAME = "catalog";

const cfg = await import("../catalog.config.mjs");
if (typeof cfg.prepare === "function") await cfg.prepare({ offline: OFFLINE });
const { meta, sections, STATUS = {} } = cfg;
const { T } = await import("../src/line/cards.js");

// ---------------- 找 Chrome ----------------
const CHROME = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
].filter(Boolean).find((p) => fs.existsSync(p));
if (!CHROME) {
  console.error("✗ 找不到 Chrome。裝 Chrome，或設 CHROME_PATH 指到執行檔（量高度與轉 PDF 都需要）");
  process.exit(1);
}

// ---------------- Flex JSON → HTML ----------------
// 對照 LINE 的 Flex 規格把常用屬性翻成 CSS。不求像素級精準，求「看得出實機長怎樣」。
const SIZE = { xxs: 11, xs: 13, sm: 14, md: 16, lg: 19, xl: 22, xxl: 29, "3xl": 35, "4xl": 45, "5xl": 65 };
const SPACE = { none: 0, xs: 2, sm: 4, md: 8, lg: 12, xl: 16, xxl: 20 };
const BUBBLE_W = { nano: 120, micro: 160, deca: 220, hecto: 241, kilo: 260, mega: 300, giga: 360 };
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const px = (v) => (v == null ? null : /^\d+(\.\d+)?$/.test(String(v)) ? `${v}px` : String(v).endsWith("px") || String(v).endsWith("%") ? String(v) : SPACE[v] != null ? `${SPACE[v]}px` : String(v));

function styleOf(c, parentLayout) {
  const st = [];
  if (c.margin) st.push(parentLayout === "horizontal" || parentLayout === "baseline" ? `margin-left:${px(c.margin)}` : `margin-top:${px(c.margin)}`);
  if (c.flex != null) st.push(`flex:${c.flex} ${c.flex === 0 ? "0 auto" : "1 0"}`);
  else if (parentLayout === "horizontal" || parentLayout === "baseline") st.push("flex:1 1 0");
  if (c.width) st.push(`width:${px(c.width)}`, `flex:0 0 ${px(c.width)}`);
  if (c.height) st.push(`height:${px(c.height)}`);
  if (c.backgroundColor) st.push(`background:${c.backgroundColor}`);
  if (c.cornerRadius) st.push(`border-radius:${px(c.cornerRadius)}`);
  if (c.borderWidth) st.push(`border:${px(c.borderWidth)} solid ${c.borderColor || "#ccc"}`);
  if (c.paddingAll) st.push(`padding:${px(c.paddingAll)}`);
  if (c.paddingTop) st.push(`padding-top:${px(c.paddingTop)}`);
  if (c.paddingBottom) st.push(`padding-bottom:${px(c.paddingBottom)}`);
  if (c.paddingStart) st.push(`padding-left:${px(c.paddingStart)}`);
  if (c.paddingEnd) st.push(`padding-right:${px(c.paddingEnd)}`);
  if (c.offsetTop) st.push(`position:relative;top:${px(c.offsetTop)}`);
  return st.join(";");
}

function render(c, parentLayout = "vertical") {
  if (!c) return "";
  switch (c.type) {
    case "box": {
      const dir = c.layout === "vertical" ? "column" : "row";
      const st = ["display:flex", `flex-direction:${dir}`, "min-width:0", styleOf(c, parentLayout)];
      if (c.layout === "baseline") st.push("align-items:baseline");
      if (c.alignItems) st.push(`align-items:${c.alignItems}`);
      if (c.justifyContent) st.push(`justify-content:${c.justifyContent}`);
      if (c.background?.type === "linearGradient") st.push(`background:linear-gradient(${c.background.angle || "0deg"},${c.background.startColor},${c.background.endColor})`);
      const gap = c.spacing ? SPACE[c.spacing] ?? parseInt(c.spacing) : 0;
      const kids = (c.contents || []).map((k, i) => {
        let h = render(k, c.layout);
        if (gap && i > 0 && !k.margin) h = h.replace(/^<(\w+) style="/, `<$1 style="${dir === "row" ? "margin-left" : "margin-top"}:${gap}px;`);
        return h;
      });
      return `<div style="${st.join(";")}">${kids.join("")}</div>`;
    }
    case "text": {
      const st = [`font-size:${SIZE[c.size] || (c.size ? c.size : 14)}px`, `color:${c.color || "#111"}`, "line-height:1.4", styleOf(c, parentLayout)];
      if (c.weight === "bold") st.push("font-weight:700");
      if (c.align) st.push(`text-align:${c.align}`);
      if (c.wrap) st.push("white-space:pre-wrap;word-break:break-all");
      else st.push("white-space:nowrap;overflow:hidden;text-overflow:ellipsis");
      if (c.decoration) st.push(`text-decoration:${c.decoration}`);
      if (c.maxLines) st.push(`display:-webkit-box;-webkit-line-clamp:${c.maxLines};-webkit-box-orient:vertical;overflow:hidden`);
      if (c.gravity === "center") st.push("align-self:center");
      const inner = c.contents?.length
        ? c.contents.map((s) => `<span style="${s.color ? `color:${s.color};` : ""}${s.weight === "bold" ? "font-weight:700;" : ""}${s.size ? `font-size:${SIZE[s.size] || 14}px;` : ""}">${esc(s.text)}</span>`).join("")
        : esc(c.text);
      return `<div style="${st.join(";")}">${inner}</div>`;
    }
    case "button": {
      const primary = c.style === "primary";
      const h = c.height === "sm" ? 40 : 52;
      const { height: _h, ...rest } = c; // 按鈕的 height 是 sm/md，不是間距單位，不能餵給 styleOf
      const st = [`height:${h}px`, `line-height:${h}px`, "border-radius:8px", "text-align:center", `font-size:${c.height === "sm" ? 14 : 16}px`, "font-weight:700", "overflow:hidden", "white-space:nowrap", "text-overflow:ellipsis", "padding:0 8px", styleOf(rest, parentLayout)];
      if (primary) st.push(`background:${c.color || "#17c950"}`, "color:#fff");
      else st.push("background:#F0F1EE", `color:${c.color || "#111"}`);
      const kind = c.action?.type === "uri" ? " ↗" : c.action?.type === "clipboard" ? " ⧉" : "";
      return `<div style="${st.join(";")}">${esc(c.action?.label || "")}${kind}</div>`;
    }
    case "separator":
      return `<div style="border-top:1px solid ${c.color || T.line};${styleOf(c, parentLayout)}"></div>`;
    case "filler":
      return `<div style="flex:1 1 0"></div>`;
    case "spacer":
      return `<div style="height:${px(c.size || "md")}"></div>`;
    case "image": {
      const ratio = (c.aspectRatio || "1:1").split(":").map(Number);
      return `<div style="width:100%;aspect-ratio:${ratio[0]}/${ratio[1]};background:#DDE3E8 url('${c.url}') center/${c.aspectMode === "cover" ? "cover" : "contain"} no-repeat;${styleOf(c, parentLayout)}"></div>`;
    }
    case "icon":
      return `<span style="display:inline-block;width:${SIZE[c.size] || 14}px;height:${SIZE[c.size] || 14}px;background:#ccc;border-radius:2px;${styleOf(c, parentLayout)}"></span>`;
    default:
      return "";
  }
}

function renderBubble(b) {
  const w = BUBBLE_W[b.size || "mega"];
  const parts = [];
  const bg = (k) => b.styles?.[k]?.backgroundColor;
  if (b.header) parts.push(`<div style="${bg("header") ? `background:${bg("header")};` : ""}">${render({ ...b.header, paddingAll: b.header.paddingAll || "20px" })}</div>`);
  if (b.hero) parts.push(render(b.hero));
  if (b.body) parts.push(`<div style="${bg("body") ? `background:${bg("body")};` : ""}">${render({ ...b.body, paddingAll: b.body.paddingAll || "20px" })}</div>`);
  if (b.footer) parts.push(`<div style="${bg("footer") ? `background:${bg("footer")};` : ""}${b.styles?.footer?.separator ? `border-top:1px solid ${T.line};` : ""}">${render({ ...b.footer, paddingAll: b.footer.paddingAll || "10px" })}</div>`);
  return `<div class="bubble" style="width:${w}px">${parts.join("")}</div>`;
}

function renderMessage(m) {
  if (m.type === "flex") {
    const c = m.contents;
    if (c.type === "carousel") return `<div class="carousel">${c.contents.map(renderBubble).join("")}</div>`;
    return renderBubble(c);
  }
  if (m.type === "text") return `<div class="txt">${esc(m.text)}</div>`;
  return `<div class="txt">[${m.type}]</div>`;
}

function renderQuick(q) {
  if (!q?.items?.length) return "";
  const icon = (a) => (a.type === "camera" ? "📷 " : a.type === "cameraRoll" ? "🖼 " : "");
  return `<div class="quick">${q.items.map((it) => `<span>${icon(it.action)}${esc(it.action.label)}</span>`).join("")}</div>`;
}

function renderChat(msgs) {
  const last = msgs[msgs.length - 1];
  return `<div class="chat">${msgs.map((m) => `<div class="row"><div class="avatar">${esc(meta.avatar || "B")}</div>${renderMessage(m)}</div>`).join("")}${renderQuick(last?.quickReply)}</div>`;
}

const altOf = (msgs) => msgs.map((m) => (m.type === "flex" ? m.altText : m.text?.split("\n")[0])).filter(Boolean).join(" ／ ");

// ---------------- 組區塊 ----------------
const badgeClass = { [STATUS.live]: "b-live", [STATUS.todo]: "b-plan", [STATUS.web]: "b-web" };
const blocks = [];
let total = 0;
for (const sec of sections) {
  blocks.push({ kind: "head", id: `h${blocks.length}`, html: `<div class="sechead"><h2><span class="dot"></span>${esc(sec.title)} <small>· ${sec.items.length} 種</small></h2><p class="lead">${esc(sec.lead)}</p></div>` });
  for (const it of sec.items) {
    const msgs = it.msgs();
    total++;
    blocks.push({
      kind: "item",
      id: `i${blocks.length}`,
      html: `<article class="item">
  <header><h3>${esc(it.name)}</h3><code>${esc(it.tag)}</code><span class="badge ${badgeClass[it.status] || "b-plan"}">${esc(it.status)}</span></header>
  <p>${esc(it.desc)}</p>
  ${renderChat(msgs)}
  <footer>推播列顯示：${esc(altOf(msgs))}</footer>
</article>`,
    });
  }
}

const rm = meta.richMenu;
const richMenuBlock = rm
  ? `<section><h2><span class="dot"></span>Rich Menu 與快捷列 <small>· 入口</small></h2>
<p class="lead">${esc(rm.lead || "")}</p>
<div class="rm-wrap">
  <div class="rm" style="grid-template-columns:repeat(${rm.cols || 3},1fr)">
    ${rm.cells.map(([t, d, i]) => `<div class="cell"><div class="ic">${esc(i || "")}</div><b>${esc(t)}</b><small>${esc(d)}</small></div>`).join("")}
  </div>
  <div class="rm-note"><b>平台限制與對策</b><ul>${(rm.notes || []).map((n) => `<li>${esc(n)}</li>`).join("")}</ul></div>
</div></section>`
  : "";

const cover = `<div class="cover">
  <h1>${esc(meta.title)}</h1>
  <p>${esc(meta.intro)}</p>
  <div class="meta">${(meta.metaLine || []).map((s) => `<span>${esc(s)}</span>`).join("")}</div>
  <div class="legend">狀態：${(meta.legend || []).map(([k, v]) => `<span class="badge ${badgeClass[k] || "b-plan"}">${esc(k)}</span> ${esc(v)}`).join(" ")}</div>
</div>`;

const CSS = `
* { box-sizing: border-box; }
body { font-family: "Noto Sans TC","Microsoft JhengHei","PingFang TC",system-ui,sans-serif; color:${T.ink}; margin:0; background:#fff; }
.cover { padding: 8px 8px 10px; border-bottom: 2px solid ${T.brand}; margin-bottom: 14px; }
.cover h1 { font-size: 30px; margin: 0 0 6px; color:${T.brand}; }
.cover p { margin: 4px 0; color:#4b5560; font-size: 14px; }
.cover .meta { display:flex; gap:18px; flex-wrap:wrap; font-size:13px; color:${T.muted}; margin-top:8px; }
.legend { display:flex; gap:10px; margin-top:10px; font-size:12px; align-items:center; flex-wrap:wrap; }
h2 { font-size: 20px; margin: 6px 0 4px; color:${T.brand}; display:flex; align-items:center; gap:8px; }
h2 small { color:${T.grey}; font-weight:400; font-size:13px; }
.dot { width:9px; height:9px; border-radius:50%; background:${T.brandMid}; display:inline-block; }
.lead { color:#4b5560; font-size:13px; margin: 0 0 8px 17px; max-width: 900px; }
.item { min-width:0; border:1px solid ${T.line}; border-radius: 12px; padding: 12px 14px 10px; background:#fff; }
.item header { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.item h3 { font-size: 15px; margin:0; }
.item code { font-size: 11px; background:#F3F5F7; border:1px solid ${T.line}; border-radius:6px; padding:1px 6px; color:#4b5560; }
.item p { font-size: 12px; color:#4b5560; margin: 6px 0 10px; line-height:1.5; }
.item footer { font-size: 11px; color:${T.grey}; margin-top:8px; }
.badge { font-size:11px; padding:2px 8px; border-radius: 10px; font-weight:700; white-space:nowrap; }
.b-live { background:${T.brandSoft}; color:${T.brandMid}; }
.b-plan { background:#ECEEF1; color:${T.muted}; }
.b-web { background:${T.accentSoft}; color:#8A6A1E; }
.chat { background:#8DA5CB; border-radius: 12px; padding: 12px 10px 10px; overflow:hidden; zoom: 0.74; max-height: 760px; }
.row { display:flex; gap:8px; align-items:flex-start; margin-bottom:8px; }
.avatar { width:28px; height:28px; border-radius:50%; background:${T.brand}; color:#fff; font-size:13px; font-weight:700; display:flex; align-items:center; justify-content:center; flex:0 0 28px; }
.bubble { background:#fff; border-radius: 14px; overflow:hidden; box-shadow: 0 1px 2px rgba(0,0,0,.12); font-size:14px; }
.carousel { display:flex; gap:8px; overflow:hidden; max-width:100%; max-height:430px; align-items:flex-start; }
.carousel .bubble { flex: 0 0 auto; }
.txt { background:#fff; border-radius: 14px; padding: 8px 12px; font-size:14px; white-space:pre-wrap; max-width: 300px; line-height:1.45; }
.quick { display:flex; gap:6px; flex-wrap:wrap; margin-top:4px; padding-left:36px; }
.quick span { background:#fff; border:1px solid #cfd8e6; border-radius: 16px; padding: 4px 10px; font-size:12px; color:${T.ink}; }
.rm-wrap { display:grid; grid-template-columns: 1fr 1.3fr; gap:16px; align-items:start; margin-left:17px; }
.rm { display:grid; gap:6px; background:${T.brand}; padding:8px; border-radius:12px; }
.cell { background:${T.surface}; border-radius:10px; padding:14px 8px 12px; text-align:center; min-height:96px; }
.cell .ic { font-size:22px; color:${T.brandMid}; }
.cell b { display:block; font-size:14px; margin-top:4px; color:${T.brand}; }
.cell small { display:block; font-size:10px; color:${T.muted}; margin-top:2px; }
.rm-note { font-size:12px; color:#4b5560; }
.rm-note ul { margin: 4px 0 10px; padding-left: 18px; }
.rm-note li { margin: 2px 0; }
`;

// A4 橫向 297×210mm，邊界 8mm → 內容約 281×194mm；以 96dpi 換算成 px
const PAGE_W = Math.floor((281 / 25.4) * 96);
const PAGE_H = Math.floor((194 / 25.4) * 96);
const GAP = 12;
const COLS = 3;
const COL_W = Math.floor((PAGE_W - GAP * (COLS - 1)) / COLS);

const tailNote = `<p style="font-size:11px;color:${T.grey};margin-top:10px">共 ${total} 張卡／訊息。渲染差異：LINE 實機字型與行距略有不同；輪播在手機上可左右滑動，這裡只展開前幾張。</p>`;
const all = [
  { kind: "wide", id: "cover", html: cover },
  ...(richMenuBlock ? [{ kind: "wide", id: "richmenu", html: richMenuBlock }] : []),
  ...blocks,
  { kind: "wide", id: "tail", html: tailNote },
];

// ---------------- 第一趟：用 Chrome 量每個區塊的高度 ----------------
// 純算高度很難算準（中文換行、卡片巢狀），乾脆讓瀏覽器算完把結果寫進 DOM，再用 --dump-dom 撈回來。
const measureHtml = `<!doctype html><html><head><meta charset="utf-8"><style>${CSS} body{padding:0;margin:0} .mw{width:${PAGE_W}px} .mi{width:${COL_W}px}</style></head><body>
${all.map((b) => `<div class="${b.kind === "item" ? "mi" : "mw"}" data-id="${b.id}">${b.html}</div>`).join("\n")}
<pre id="m"></pre>
<script>window.addEventListener('load',()=>{setTimeout(()=>{const o={};document.querySelectorAll('[data-id]').forEach(e=>{o[e.dataset.id]=Math.ceil(e.getBoundingClientRect().height)});document.getElementById('m').textContent='@@'+JSON.stringify(o)+'@@';},300)});</script>
</body></html>`;
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-measure-"));
const measurePath = path.join(tmpDir, "measure.html");
fs.writeFileSync(measurePath, measureHtml, "utf8");
const dom = execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--no-sandbox", "--virtual-time-budget=12000", "--window-size=1400,900", "--dump-dom", `file:///${measurePath.replace(/\\/g, "/")}`], {
  maxBuffer: 64 * 1024 * 1024,
  stdio: ["ignore", "pipe", "ignore"],
}).toString("utf8");
const matched = dom.match(/@@(\{[\s\S]*?\})@@/);
if (!matched) {
  console.error("✗ 量高度失敗：Chrome --dump-dom 沒回傳結果。多半是 Chrome 版本太舊或被安全軟體擋住");
  process.exit(1);
}
const H = JSON.parse(matched[1]);
console.log(`量到 ${Object.keys(H).length} 個區塊高度`);

// ---------------- 分頁：wide/head 滿版；item 用三欄貪婪填充 ----------------
const pages = [];
let page = { placed: [], y: 0 };
const newPage = () => {
  if (page.placed.length) pages.push(page);
  page = { placed: [], y: 0 };
};
const HEAD_MIN_FOLLOW = 200; // 段落標題下面至少要放得下一張矮卡，否則整段換頁（不留孤立標題）
let i = 0;
while (i < all.length) {
  const b = all[i];
  const h = H[b.id] || 100;
  if (b.kind === "wide" || b.kind === "head") {
    const need = h + (b.kind === "head" ? HEAD_MIN_FOLLOW : 0);
    if (page.y > 0 && page.y + need > PAGE_H) newPage();
    page.placed.push({ id: b.id, x: 0, y: page.y, w: PAGE_W, html: b.html });
    page.y += h + GAP;
    i++;
    continue;
  }
  const cols = Array.from({ length: COLS }, () => page.y);
  let placedAny = false;
  while (i < all.length && all[i].kind === "item") {
    const it = all[i];
    const ih = H[it.id] || 200;
    let c = 0;
    for (let k = 1; k < COLS; k++) if (cols[k] < cols[c]) c = k;
    if (cols[c] + ih > PAGE_H) break;
    page.placed.push({ id: it.id, x: c * (COL_W + GAP), y: cols[c], w: COL_W, html: it.html });
    cols[c] += ih + GAP;
    placedAny = true;
    i++;
  }
  page.y = Math.max(...cols);
  if (i < all.length && all[i].kind === "item") {
    if (!placedAny) {
      const last = page.placed[page.placed.length - 1];
      const carry = last && last.id.startsWith("h") ? page.placed.pop() : null;
      newPage();
      if (carry) {
        page.placed.push({ ...carry, y: 0 });
        page.y = (H[carry.id] || 60) + GAP;
      }
      if (H[all[i].id] > PAGE_H - page.y) {
        // 單張卡比一整頁還高（不該發生，除非卡片爆長）：硬放，不要無限迴圈
        const it = all[i];
        page.placed.push({ id: it.id, x: 0, y: page.y, w: COL_W, html: it.html });
        page.y = PAGE_H;
        i++;
        newPage();
      }
      continue;
    }
    newPage();
  }
}
newPage();
console.log(`分成 ${pages.length} 頁`);

const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>${esc(meta.title)}</title>
<style>
@page { size: A4 landscape; margin: 8mm; }
${CSS}
.page { position:relative; width:${PAGE_W}px; height:${PAGE_H}px; overflow:hidden; break-after: page; page-break-after: always; margin: 0 auto; }
.page:last-child { break-after: auto; page-break-after: auto; }
.blk { position:absolute; }
.pn { position:absolute; right:0; bottom:0; font-size:10px; color:${T.grey}; }
@media screen { body { background:#e9ebee; padding: 16px 0; } .page { background:#fff; margin-bottom: 16px; box-shadow: 0 2px 8px rgba(0,0,0,.12); } }
</style></head><body>
${pages.map((p, pi) => `<div class="page">${p.placed.map((b) => `<div class="blk" style="left:${b.x}px;top:${b.y}px;width:${b.w}px">${b.html}</div>`).join("")}<div class="pn">${esc(meta.title)} · ${pi + 1}/${pages.length}</div></div>`).join("\n")}
</body></html>`;

fs.mkdirSync("docs", { recursive: true });
const outHtml = path.join("docs", `${OUT_NAME}.html`);
fs.writeFileSync(outHtml, html, "utf8");
console.log(`寫入 ${outHtml}（${total} 張卡）`);

if (!NO_PDF) {
  const outPdf = path.resolve("docs", `${OUT_NAME}.pdf`);
  execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--no-sandbox", "--no-pdf-header-footer", "--virtual-time-budget=12000", `--print-to-pdf=${outPdf}`, `file:///${path.resolve(outHtml).replace(/\\/g, "/")}`], { stdio: "ignore" });
  console.log(`寫入 ${outPdf}（${Math.round(fs.statSync(outPdf).size / 1024)} KB）`);
}
await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
