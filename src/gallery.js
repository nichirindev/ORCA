import "./styles.css";
import { loadGallery, removeGalleryEntry } from "./store.js";
import { downloadSvg, svgUrl, toast } from "./util.js";

const grid = document.getElementById("gallery-grid");
const empty = document.getElementById("gallery-empty");

const urls = new Map(); // id -> object URL (revoked on delete / re-render)

function revoke(id) {
  const u = urls.get(id);
  if (u) {
    URL.revokeObjectURL(u);
    urls.delete(id);
  }
}

function play(entry, img) {
  revoke(entry.id);
  const url = svgUrl(entry.svg);
  urls.set(entry.id, url);
  img.src = url;
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function card(entry) {
  const el = document.createElement("article");
  el.className = "card";
  el.innerHTML = `
    <div class="card-preview"></div>
    <div class="card-meta">
      <div>
        <h3></h3>
        <p class="mono muted"></p>
      </div>
      <div class="card-actions">
        <button class="btn btn-ghost" data-act="replay" title="Replay">↻</button>
        <button class="btn btn-ghost" data-act="download" title="Download">↓</button>
        <button class="btn btn-ghost" data-act="delete" title="Remove">✕</button>
      </div>
    </div>`;
  el.querySelector("h3").textContent = entry.title;
  el.querySelector(".card-meta p").textContent =
    `${formatDate(entry.createdAt)}${entry.cols ? ` · ${entry.cols} cols` : ""}`;

  const holder = el.querySelector(".card-preview");
  const img = document.createElement("img");
  img.alt = `ASCII portrait: ${entry.title}`;
  holder.appendChild(img);

  el.querySelector('[data-act="replay"]').addEventListener("click", () => play(entry, img));
  el.querySelector('[data-act="download"]').addEventListener("click", () =>
    downloadSvg(entry.svg, `${entry.title}-ascii.svg`)
  );
  el.querySelector('[data-act="delete"]').addEventListener("click", () => {
    revoke(entry.id);
    removeGalleryEntry(entry.id);
    toast("Portrait removed.");
    render();
  });

  // type it in the first time the card scrolls into view, then hold
  const io = new IntersectionObserver(
    (entriesObs) => {
      for (const ev of entriesObs) {
        if (ev.isIntersecting) {
          play(entry, img);
          io.disconnect();
        }
      }
    },
    { threshold: 0.25 }
  );
  io.observe(el);
  return el;
}

function render() {
  const entries = loadGallery();
  grid.innerHTML = "";
  if (!entries.length) {
    grid.hidden = true;
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  grid.hidden = false;
  for (const entry of entries) grid.appendChild(card(entry));
}

render();
