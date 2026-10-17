/** The portfolio: saved portraits live in localStorage, nothing leaves the browser. */

const KEY = "ascii-term:gallery";
const MAX_ENTRIES = 24;

export function loadGallery() {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function persist(arr) {
  try {
    localStorage.setItem(KEY, JSON.stringify(arr));
  } catch {
    throw new Error("Browser storage is full — remove a portrait first.");
  }
}

export function addGalleryEntry({ title, svg, cols }) {
  const arr = loadGallery();
  arr.unshift({
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    createdAt: Date.now(),
    title: title || "untitled",
    cols: cols || 0,
    svg,
  });
  while (arr.length > MAX_ENTRIES) arr.pop();
  persist(arr);
  return arr;
}

export function removeGalleryEntry(id) {
  persist(loadGallery().filter((e) => e.id !== id));
}
