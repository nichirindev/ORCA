/**
 * Static DOM-id checker: every element id referenced from JS must exist in an
 * HTML page. Catches the whole "getElementById returned null" bug class
 * (e.g. num("threshold") vs the real id "in-threshold") without a browser.
 *
 *   node scripts/check-ids.mjs
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const htmlIds = new Set();
for (const f of ["index.html", "gallery.html"]) {
  const html = readFileSync(join(ROOT, f), "utf8");
  for (const m of html.matchAll(/id="([^"]+)"/g)) htmlIds.add(m[1]);
}

const errors = [];

for (const f of ["src/app.js", "src/gallery.js"]) {
  const js = readFileSync(join(ROOT, f), "utf8");

  // literal lookups: $("id") and document.getElementById("id")
  for (const m of js.matchAll(/\$\("([^"]+)"\)/g)) {
    if (!htmlIds.has(m[1])) errors.push(`${f}: $("${m[1]}") -> no element with that id`);
  }
  for (const m of js.matchAll(/getElementById\("([^"]+)"\)/g)) {
    if (!htmlIds.has(m[1])) errors.push(`${f}: getElementById("${m[1]}") -> no element with that id`);
  }

  // num("key") -> control inputs must be id="in-key"
  for (const m of js.matchAll(/\bnum\("([^"]+)"\)/g)) {
    const id = `in-${m[1]}`;
    if (!htmlIds.has(id)) errors.push(`${f}: num("${m[1]}") -> missing #${id}`);
  }

  // control arrays: ["cols", ...] are looked up as $("in-<entry>")
  for (const name of ["NUMERIC", "CHECKS", "TEXTS"]) {
    const am = js.match(new RegExp(`const ${name} = \\[([^\\]]+)\\]`));
    if (!am) continue;
    for (const k of am[1].matchAll(/"([^"]+)"/g)) {
      const id = `in-${k[1]}`;
      if (!htmlIds.has(id)) errors.push(`${f}: ${name} entry "${k[1]}" -> missing #${id}`);
    }
  }
}

if (errors.length) {
  console.error("ID CHECK FAILED:");
  for (const e of errors) console.error("  -", e);
  process.exit(1);
}
console.log(`id check OK (${htmlIds.size} ids across index.html + gallery.html)`);
