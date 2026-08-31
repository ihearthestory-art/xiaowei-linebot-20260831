// 前置檢查：開工前先跑一次，把「等一下一定會卡住」的東西一次列出來。
// 每一項給 ✅／⚠／❌ 加一句修法。有 ❌ 也不會中斷，讓你一次看完全部。
// 用法：npm run preflight
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
if (fs.existsSync(".env")) process.loadEnvFile(".env");

const rows = [];
const add = (name, ok, detail, fix = "") => rows.push({ name, ok, detail, fix });

/** 跑一個指令，回 stdout+stderr（很多 CLI 把狀態印在 stderr）；失敗或逾時回 null。
 *  這裡的指令全是寫死的字串，用 shell 執行才吃得到 Windows 的 npm.cmd／npx.cmd
 *  （Node 18+ 基於安全考量，不開 shell 時拒絕直接執行 .cmd）。
 *  stdin 給空字串，避免互動式 CLI 等輸入等到天荒地老。 */
function run(cmdline, timeout = 60000) {
  const r = spawnSync(cmdline, { encoding: "utf8", timeout, input: "", shell: true, windowsHide: true });
  if (r.error || r.status !== 0) return null;
  return `${r.stdout || ""}${r.stderr || ""}`.replace(/\x1b\[[0-9;]*m/g, "").trim();
}

// ---- 1. Node ----
const major = Number(process.versions.node.split(".")[0]);
add("Node", major >= 22, `v${process.versions.node}`, major >= 22 ? "" : "需要 Node >= 22（node:sqlite）。建議 Node 24：nvm install 24");
if (major >= 22 && major < 23) add("node:sqlite 旗標", true, "Node 22 需要 --experimental-sqlite", "Node 22 跑 start/test 要加 --experimental-sqlite，或改用 Node 24");

// ---- 2. npm ----
const npmV = run("npm -v");
add("npm", Boolean(npmV), npmV || "找不到", npmV ? "" : "重裝 Node（npm 隨附）");

// ---- 3. 相依套件 ----
const hasModules = fs.existsSync("node_modules/express");
add("npm 相依套件", hasModules, hasModules ? "express 已安裝" : "node_modules 缺 express", hasModules ? "" : "npm install");

// ---- 4. 部署 CLI（Zeabur）----
const zeabur = run("npx zeabur@latest auth status", 180000);
const zeaburOk = Boolean(zeabur) && /logged in|已登入/i.test(zeabur);
add("Zeabur CLI 登入", zeaburOk, zeabur ? zeabur.split("\n")[0].replace(/^INFO\s+/, "").slice(0, 58) : "無回應或未登入", zeaburOk ? "" : "npx zeabur@latest auth login（不用 Zeabur 部署可略過）");

// ---- 5. GitHub CLI ----
const gh = run("gh auth status", 30000);
add("GitHub CLI 登入", Boolean(gh), gh ? gh.split("\n").find((l) => l.includes("account")) || "已登入" : "未登入或未安裝", gh ? "" : "gh auth login（沒有要用 GitHub 部署可略過）");

// ---- 6. Chrome（render-catalog 產 PDF 用）----
const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
].filter(Boolean);
const chrome = chromeCandidates.find((p) => fs.existsSync(p));
add("Chrome（產型錄 PDF）", Boolean(chrome), chrome || "找不到", chrome ? "" : "裝 Chrome，或設 CHROME_PATH 指到執行檔");

// ---- 7. Python + Pillow（rich menu 出圖用）----
// Windows 常有多個 Python（py 啟動器→uv 版、python→Store 版），Pillow 可能只裝在其中一個：
// 逐一試，回報「哪個指令有 PIL」，出圖時就用那個指令跑 richmenu_compose.py。
const pyCands = ["py", "python", "python3"].filter((c) => run(`${c} --version`, 20000));
add("Python", pyCands.length > 0, pyCands.length ? pyCands.map((c) => `${c}(${run(`${c} --version`, 20000)})`).join("  ") : "找不到", pyCands.length ? "" : "裝 Python 3（只有要用 richmenu_compose.py 出圖才需要）");
if (pyCands.length) {
  const withPil = pyCands.find((c) => run(`${c} -c "import PIL;print(PIL.__version__)"`, 30000));
  add("Pillow（PIL）", Boolean(withPil), withPil ? `用「${withPil}」跑出圖腳本（v${run(`${withPil} -c "import PIL;print(PIL.__version__)"`, 30000)}）` : "所有 Python 都沒裝", withPil ? "" : `${pyCands[0]} -m pip install pillow`);
}

// ---- 8. 中文字型（rich menu 出圖不要變豆腐字）----
const fonts = ["C:\\Windows\\Fonts\\msjhbd.ttc", "C:\\Windows\\Fonts\\msjh.ttc", "/System/Library/Fonts/PingFang.ttc", "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"];
const font = fonts.find((p) => fs.existsSync(p));
add("中文字型", Boolean(font), font || "找不到常見 CJK 字型", font ? "" : "裝 Noto Sans CJK，或改 richmenu_compose.py 的 FONT_CANDIDATES");

// ---- 9. .env 必要變數 ----
const envExists = fs.existsSync(".env");
add(".env 檔案", envExists, envExists ? "存在" : "不存在", envExists ? "" : "cp docs/local-env.example .env 後填值");
for (const key of ["LINE_CHANNEL_SECRET", "LINE_CHANNEL_ACCESS_TOKEN"]) {
  const has = Boolean(process.env[key]);
  add(`env ${key}`, has, has ? `已設定（${String(process.env[key]).length} 字元）` : "缺", has ? "" : "到 LINE Developers Console 複製後填進 .env");
}
for (const key of ["PUBLIC_BASE_URL", "ADMIN_USER_IDS"]) {
  const has = Boolean(process.env[key]);
  add(`env ${key}`, true, has ? "已設定" : "未設定（可選）", has ? "" : key === "PUBLIC_BASE_URL" ? "沒設就不會顯示卡片 hero 圖" : "沒設就沒人能用 /狀態 指令");
}

// ---- 10. 資料目錄可寫 ----
const dataDir = process.env.DATA_DIR || "./data";
let writable = false;
try {
  fs.mkdirSync(dataDir, { recursive: true });
  const probe = path.join(dataDir, ".preflight");
  fs.writeFileSync(probe, "ok");
  fs.unlinkSync(probe);
  writable = true;
} catch {
  /* 保持 false */
}
add("DATA_DIR 可寫", writable, `${path.resolve(dataDir)}`, writable ? "" : "換一個有寫入權限的目錄，或在容器裡掛 volume 到 /app/data");

// ---- 輸出 ----
const pad = (s, n) => s + " ".repeat(Math.max(0, n - [...s].reduce((w, c) => w + (c.charCodeAt(0) > 0x2e80 ? 2 : 1), 0)));
console.log(`\n前置檢查  ${os.platform()} ${os.release()}  cwd=${root}\n`);
let bad = 0;
for (const r of rows) {
  const icon = r.ok ? (r.fix ? "⚠" : "✅") : "❌";
  if (!r.ok) bad++;
  console.log(`${icon} ${pad(r.name, 31)} ${pad(r.detail, 46)} ${r.fix}`);
}
console.log(`\n${rows.length} 項檢查，${bad} 項未通過。❌ 修完再開工；⚠ 是可選項，不影響本機跑起來。`);
