import "./styles.css";
import { DEFAULT_RAMP, gridToRows, rowsStats } from "./ascii.js";
import { loadImage, prepare, sampleToGrid } from "./image.js";
import { buildSvg } from "./svg.js";
import { addGalleryEntry } from "./store.js";
import { downloadSvg, svgUrl, toast } from "./util.js";

const $ = (id) => document.getElementById(id);
// control inputs all share the in-<key> id prefix (val-<key> badges display them)
const num = (key) => parseFloat($(`in-${key}`).value);

const state = {
  image: null,
  fileName: "",
  svg: "",
  rowsTxt: [],
};

let previewUrl = null;
let renderTimer = null;

/* ---------------- source: browse / drop / paste ---------------- */

async function useFile(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    if (!img.naturalWidth || !img.naturalHeight) throw new Error("no dimensions");
    state.image = img;
    state.fileName = (file.name || "pasted image").replace(/\.[^.]+$/, "") || "portrait";
    $("source-name").textContent = file.name || "pasted image";
    render();
  } catch {
    // no MIME gate: some systems report an empty type for perfectly valid
    // .jpg/.png files, so the decoder decides — we only complain when it fails
    toast(`Could not read "${file.name || "clipboard image"}" — use a PNG or JPG.`);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const dz = $("dropzone");
const fileInput = $("file-input");
dz.addEventListener("click", () => fileInput.click());
dz.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") fileInput.click();
});
fileInput.addEventListener("change", () => {
  const f = fileInput.files[0];
  fileInput.value = ""; // reset so picking the SAME file again still fires change
  useFile(f);
});

// dropping anywhere on the page works — and never lets the browser navigate
// away to the raw file (that's the default drop behaviour)
window.addEventListener("dragenter", (e) => {
  if (e.dataTransfer?.types?.includes("Files")) dz.classList.add("over");
});
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("dragleave", (e) => {
  if (!e.relatedTarget) dz.classList.remove("over");
});
window.addEventListener("drop", (e) => {
  e.preventDefault();
  dz.classList.remove("over");
  const f = e.dataTransfer?.files?.[0];
  if (f) useFile(f);
});

// clicking the empty preview area also opens the picker (except on the artwork)
$("preview").addEventListener("click", (e) => {
  if (e.target.closest("img")) return;
  fileInput.click();
});

window.addEventListener("paste", (e) => {
  const items = e.clipboardData?.files || [];
  if (items.length) useFile(items[0]);
});

$("clear-btn").addEventListener("click", () => {
  state.image = null;
  state.fileName = "";
  state.svg = "";
  fileInput.value = "";
  $("source-name").textContent = "no image selected";
  clearPreview();
  $("prep-note").textContent = "";
  $("stats").textContent = "";
});

/* ---------------- controls ---------------- */

const NUMERIC = ["threshold", "cols", "contrast", "brightness", "gamma", "floor"];
const CHECKS = ["removebg", "invert", "static"];
const TEXTS = ["title", "user", "name", "ink", "ramp", "duration"];

function fmt(key, v) {
  if (key === "contrast" || key === "brightness" || key === "gamma") return v.toFixed(2);
  if (key === "floor") return v.toFixed(2);
  if (key === "duration") return `${v}s`;
  return String(v);
}

function syncBadges() {
  for (const k of [...NUMERIC, "duration"]) $(`val-${k}`) && ($(`val-${k}`).textContent = fmt(k, num(k)));
  // no image yet -> no aspect ratio to honour, assume square; render()
  // overwrites this with the real rows + ratio once a photo is loaded
  if (!state.image) {
    const cols = num("cols");
    $("grid-size").textContent = `${cols} × ${Math.round((cols * 8) / 15)} chars`;
  }
}

function syncDisabled() {
  const cutout = $("in-removebg").checked;
  $("in-floor").disabled = cutout;
  $("row-floor").classList.toggle("is-disabled", cutout);
  $("in-threshold").disabled = !cutout;
  $("row-threshold").classList.toggle("is-disabled", !cutout);
}

function scheduleRender() {
  syncBadges();
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 140);
}

for (const k of NUMERIC) $(`in-${k}`).addEventListener("input", scheduleRender);
for (const k of CHECKS)
  $(`in-${k}`).addEventListener("change", () => {
    syncDisabled();
    scheduleRender();
  });
for (const k of TEXTS) $(`in-${k}`).addEventListener("input", scheduleRender);

/* ---------------- render pipeline ---------------- */

function clearPreview() {
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }
  const holder = $("preview");
  holder.querySelector("img")?.remove();
  if (!holder.querySelector(".placeholder")) {
    const ph = document.createElement("div");
    ph.className = "placeholder";
    ph.innerHTML =
      '<span class="ph-line">$ ./portrait.sh --awaiting-portrait</span>' +
      '<span class="ph-line dim">upload, drop, or paste a photo to begin</span>' +
      '<span class="cursor-block"></span>';
    holder.appendChild(ph);
  }
}

function showPreview(svg) {
  const holder = $("preview");
  holder.querySelector("img, .placeholder")?.remove();
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = svgUrl(svg);
  const img = document.createElement("img");
  img.alt = "ASCII portrait preview";
  img.src = previewUrl;
  holder.appendChild(img);
}

function render() {
  // never let a pipeline error masquerade as a file problem: useFile's catch
  // is for decoding only, so render() reports its own failures
  try {
    renderInner();
  } catch (e) {
    console.error("ascii.term: render failed", e);
    toast(`Rendering failed: ${e.message}`);
  }
}

function renderInner() {
  if (!state.image) return;

  const removeBg = $("in-removebg").checked;
  const threshold = num("threshold");
  const cols = num("cols");

  const prep = prepare(state.image, { removeBg, threshold });

  // rows follow the image's aspect ratio while cells stay 1:1.875, so the
  // finished art keeps the source's proportions instead of a fixed square
  const ar = prep.canvas.width / prep.canvas.height;
  const rows = Math.min(480, Math.max(8, Math.round((cols * 8) / 15 / ar)));

  const grid = sampleToGrid(prep.canvas, cols, rows);
  const rowsTxt = gridToRows(grid, {
    ramp: $("in-ramp").value || DEFAULT_RAMP,
    mode: prep.mode,
    invert: $("in-invert").checked,
    contrast: num("contrast"),
    brightness: num("brightness"),
    gamma: num("gamma"),
    whiteFloor: num("floor"),
    alphaThreshold: 64,
  });

  const svg = buildSvg(rowsTxt, {
    cols,
    ink: $("in-ink").value,
    title: $("in-title").value,
    user: $("in-user").value,
    name: $("in-name").value,
    printDur: Math.min(15, Math.max(2, num("duration"))),
    staticMode: $("in-static").checked,
  });

  state.rowsTxt = rowsTxt;
  state.svg = svg;
  showPreview(svg);

  const { fill } = rowsStats(rowsTxt);
  const kb = (new Blob([svg]).size / 1024).toFixed(1);
  $("stats").textContent = `${kb} KB · ${Math.round(fill * 100)}% ink`;
  $("prep-note").textContent = prep.note || "";
  const ratio = ar >= 1 ? `${ar.toFixed(2)}:1` : `1:${(1 / ar).toFixed(2)}`;
  $("grid-size").textContent = `${cols} × ${rows} chars · ${ratio}`;
}

/* ---------------- actions ---------------- */

$("btn-replay").addEventListener("click", () => {
  if (state.svg) showPreview(state.svg);
  else toast("Upload an image first.");
});

$("btn-download").addEventListener("click", () => {
  if (!state.svg) return toast("Upload an image first.");
  downloadSvg(state.svg, `${state.fileName || "portrait"}-ascii.svg`);
  toast("SVG downloaded.");
});

$("btn-copy").addEventListener("click", async () => {
  if (!state.svg) return toast("Upload an image first.");
  try {
    await navigator.clipboard.writeText(state.svg);
    toast("SVG copied to clipboard.");
  } catch {
    toast("Clipboard blocked — use Download SVG.");
  }
});

$("btn-save").addEventListener("click", () => {
  if (!state.svg) return toast("Upload an image first.");
  try {
    addGalleryEntry({
      title: state.fileName || $("in-name").value || "portrait",
      svg: state.svg,
      cols: num("cols"),
    });
    toast("Saved to My portraits.");
  } catch (e) {
    toast(e.message || "Could not save.");
  }
});

/* ---------------- boot ---------------- */

syncBadges();
syncDisabled();
