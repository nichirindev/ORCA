/**
 * End-to-end smoke test in real Chrome (system install, puppeteer-core).
 * Builds nothing itself — run `npm run build` first.
 *
 *   node scripts/e2e.mjs
 *
 * Verifies the exact bug class reported: a valid PNG must go from the file
 * input all the way to a rendered ASCII preview, with NO console errors and
 * NO misleading "could not read" toast.
 */
import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import puppeteer from "puppeteer-core";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PORT = 4180;
const BASE = `http://localhost:${PORT}`;

const CHROME = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find((p) => existsSync(p));

let fail = 0;
const ok = (cond, msg) => {
  console.log((cond ? "PASS" : "FAIL") + " - " + msg);
  if (!cond) fail++;
};

/* ---------- minimal PNG encoder (test fixture, no dependencies) ---------- */

function crc32(buf) {
  if (!crc32.table) {
    crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crc32.table[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crc32.table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function makePng(w, h, pixelFn) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  let o = 0;
  for (let y = 0; y < h; y++) {
    raw[o++] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b] = pixelFn(x, y);
      raw[o++] = r;
      raw[o++] = g;
      raw[o++] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// solid corner colour (so background removal finds it) + a shaded "head" blob
const W = 320;
const H = 420;
const png = makePng(W, H, (x, y) => {
  const bg = [18, 24, 38];
  const dx = (x - W / 2) / (W * 0.3);
  const dy = (y - H * 0.46) / (H * 0.32);
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > 1) return bg;
  const shade = 1 - d * 0.55;
  const hair = y < H * 0.46 - H * 0.2 && d < 0.95;
  if (hair) return [Math.round(40 * shade), Math.round(38 * shade), Math.round(52 * shade)];
  return [Math.round(235 * shade), Math.round(205 * shade), Math.round(175 * shade)];
});
const PNG_PATH = join(tmpdir(), "opencode", "e2e-portrait.png");
writeFileSync(PNG_PATH, png);

/* ---------- serve dist ---------- */

const server = spawn(
  process.execPath,
  [join(ROOT, "node_modules", "vite", "bin", "vite.js"), "preview", "--port", String(PORT), "--strictPort"],
  { cwd: ROOT, stdio: "ignore" }
);

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(BASE + "/index.html");
      if (r.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

/* ---------- run ---------- */

let browser;
try {
  const up = await waitForServer();
  if (!up) throw new Error("preview server never came up");
  if (!CHROME) throw new Error("no Chrome/Edge install found");

  browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);

  const consoleErrors = [];
  const pageErrors = [];
  const failedReqs = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("requestfailed", (r) => r.url().startsWith(BASE) && failedReqs.push(r.url()));

  await page.goto(BASE + "/index.html", { waitUntil: "load" });
  ok(pageErrors.length === 0, `page boots with no uncaught errors${pageErrors.length ? ` (${pageErrors[0]})` : ""}`);

  // slider -> badge path (syncBadges/scheduleRender) used to throw on boot
  await page.$eval("#in-cols", (el) => {
    el.value = "120";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 400));
  const gridSize = await page.$eval("#grid-size", (el) => el.textContent.trim());
  ok(gridSize === "120 × 64 chars", `slider updates grid size (got "${gridSize}")`);

  // the actual complaint: upload a valid PNG
  const input = await page.$("#file-input");
  await input.uploadFile(PNG_PATH);
  await page.waitForSelector("#preview img", { timeout: 8000 });
  ok(true, "PNG upload produces a preview image");

  const natural = await page.$eval("#preview img", (img) => img.naturalWidth);
  ok(natural > 0, `preview SVG decoded (naturalWidth=${natural})`);

  const stats = await page.$eval("#stats", (el) => el.textContent.trim());
  ok(/\d+ KB/.test(stats), `stats render after conversion (got "${stats}")`);

  const note = await page.$eval("#prep-note", (el) => el.textContent.trim());
  ok(note.includes("Background removed"), `cutout path ran (got "${note}")`);

  // aspect ratio: fixture is 320x420 with a ~191x269 subject blob -> the art
  // must come out portrait. The old fixed-square canvas was ~840x880 (0.95).
  const dim = await page.$eval("#preview img", (img) => [img.naturalWidth, img.naturalHeight]);
  const cutRatio = dim[0] / dim[1];
  ok(cutRatio > 0.6 && cutRatio < 0.8, `cutout art keeps subject aspect (${dim[0]}x${dim[1]} = ${cutRatio.toFixed(2)})`);

  const badge1 = await page.$eval("#grid-size", (el) => el.textContent.trim());
  const m1 = /^120 × (\d+) chars/.exec(badge1);
  ok(m1 && +m1[1] >= 85 && +m1[1] <= 95, `grid rows follow subject aspect (got "${badge1}")`);

  // photo mode: full 320x420 frame kept -> rows from the raw image ratio
  await page.$eval("#in-removebg", (el) => {
    el.checked = false;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 450));
  const dim2 = await page.$eval("#preview img", (img) => [img.naturalWidth, img.naturalHeight]);
  const phRatio = dim2[0] / dim2[1];
  ok(phRatio > 0.65 && phRatio < 0.85, `photo-mode art keeps frame aspect (${dim2[0]}x${dim2[1]} = ${phRatio.toFixed(2)})`);
  const badge2 = await page.$eval("#grid-size", (el) => el.textContent.trim());
  ok(/^120 × 84 chars/.test(badge2), `badge matches raw image ratio (got "${badge2}")`);

  const toastText = await page.evaluate(() => document.getElementById("toast")?.textContent || "");
  ok(!/Could not read|Rendering failed|Could not decode/.test(toastText), `no error toast (got "${toastText || "none"}")`);

  // save -> gallery card
  await page.click("#btn-save");
  await new Promise((r) => setTimeout(r, 300));
  await page.goto(BASE + "/gallery.html", { waitUntil: "load" });
  await page.waitForSelector("#gallery-grid .card", { timeout: 8000 });
  const cards = await page.$$eval("#gallery-grid .card", (els) => els.length);
  ok(cards === 1, `saved portrait shows up in gallery (${cards} card(s))`);
  await page.waitForSelector("#gallery-grid .card img", { timeout: 8000 });
  const galleryNatural = await page.$eval("#gallery-grid .card img", (img) => img.naturalWidth);
  ok(galleryNatural > 0, `gallery card renders its animated SVG (naturalWidth=${galleryNatural})`);

  ok(pageErrors.length === 0, `no uncaught errors during full flow${pageErrors.length ? ` (${pageErrors[0]})` : ""}`);
  ok(consoleErrors.length === 0, `no console errors${consoleErrors.length ? ` (${consoleErrors[0]})` : ""}`);
  ok(failedReqs.length === 0, `no failed requests${failedReqs.length ? ` (${failedReqs[0]})` : ""}`);
} catch (e) {
  console.log("FAIL - test crashed: " + e.message);
  fail++;
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill();
}

console.log(fail === 0 ? "\nE2E: ALL PASSED" : `\nE2E: ${fail} FAILURE(S)`);
process.exit(fail === 0 ? 0 : 1);
