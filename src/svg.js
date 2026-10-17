/**
 * ASCII rows -> self-contained animated SVG string.
 *
 * Everything is SMIL (<animate>/<set>) on purpose: GitHub runs SMIL inside
 * <img> embeds where JS
 * does not, so the portrait "types" itself in on every view and then freezes:
 * each row gets a left-to-right clip wipe with a block cursor riding the wipe
 * edge, staggered top -> bottom (one cursor sweeping down).
 */

export const SVG_DEFAULTS = {
  cols: 180,
  artW: 800, // the art is always this wide; cells shrink as COLS grow
  pad: 20,
  titlebarH: 30,
  statusH: 30,
  bg: "#0d1117",
  bg2: "#111722",
  frame: "#30363d",
  titleText: "#7d8590",
  ink: "#c9d1d9", // the single ascii color (matches Andrew6rant)
  title: "guest@ascii: ~$ ./portrait.sh",
  user: "guest@ascii",
  name: "developer",
  printDur: 6, // whole portrait prints in ~6s at any resolution
  staticMode: false, // frozen state, no animation
};

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * @param {string[]} rowsTxt one string per grid row (html-escaped internally)
 * @param {Partial<typeof SVG_DEFAULTS>} opts
 */
export function buildSvg(rowsTxt, opts = {}) {
  const o = { ...SVG_DEFAULTS, ...opts };
  const rowCount = rowsTxt.length;
  const cellW = o.artW / o.cols;
  const cellH = (cellW * 15) / 8; // ~1:1.875 char cell keeps faces undistorted
  const artH = rowCount * cellH;
  const canvasW = o.artW + o.pad * 2;
  const canvasH = o.titlebarH + artH + o.statusH + o.pad;
  const rowDur = o.printDur / rowCount;
  const stagger = rowDur; // == rowDur -> a single cursor rasters top -> bottom
  const artTop = o.titlebarH + o.pad * 0.35;

  const p = [];
  p.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" ` +
      `viewBox="0 0 ${canvasW} ${canvasH}" font-family="ui-monospace, SFMono-Regular, ` +
      `Menlo, Consolas, monospace">`
  );
  p.push(
    `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="${o.bg2}"/><stop offset="1" stop-color="${o.bg}"/>` +
      `</linearGradient></defs>`
  );

  // window chrome
  p.push(`<rect width="${canvasW}" height="${canvasH}" rx="12" fill="url(#bg)"/>`);
  p.push(
    `<rect x="0.5" y="0.5" width="${canvasW - 1}" height="${canvasH - 1}" rx="12" ` +
      `fill="none" stroke="${o.frame}" stroke-width="1"/>`
  );
  p.push(
    `<line x1="0" y1="${o.titlebarH}" x2="${canvasW}" y2="${o.titlebarH}" stroke="${o.frame}"/>`
  );
  for (const dotcol of ["#ff5f56", "#ffbd2e", "#27c93f"]) {
    const i = ["#ff5f56", "#ffbd2e", "#27c93f"].indexOf(dotcol);
    p.push(`<circle cx="${o.pad + i * 16}" cy="${o.titlebarH / 2}" r="5" fill="${dotcol}"/>`);
  }
  p.push(
    `<text x="${canvasW / 2}" y="${o.titlebarH / 2 + 4}" fill="${o.titleText}" font-size="12" ` +
      `text-anchor="middle">${esc(o.title)}</text>`
  );

  // one <text> per row (single color -> no per-char markup, tiny file)
  const fontSize = cellH * 0.86;
  for (let ry = 0; ry < rowCount; ry++) {
    const line = rowsTxt[ry];
    const y = artTop + ry * cellH + cellH * 0.74;
    const rowY = artTop + ry * cellH;
    const delay = ry * stagger;
    const text =
      `<text xml:space="preserve" x="${o.pad}" y="${y.toFixed(1)}" fill="${o.ink}" ` +
      `font-size="${fontSize.toFixed(1)}" textLength="${o.artW}" lengthAdjust="spacing">` +
      `${esc(line)}</text>`;

    if (o.staticMode) {
      p.push(text);
      continue;
    }

    p.push(
      `<clipPath id="r${ry}"><rect x="${o.pad}" y="${rowY.toFixed(1)}" height="${cellH}" width="0">` +
        `<animate attributeName="width" from="0" to="${o.artW}" begin="${delay.toFixed(3)}s" ` +
        `dur="${rowDur.toFixed(2)}s" fill="freeze"/></rect></clipPath>`
    );
    p.push(`<g clip-path="url(#r${ry})">${text}</g>`);
    p.push(
      `<rect y="${(rowY + 1).toFixed(1)}" width="${cellW}" height="${cellH - 2}" fill="${o.ink}" opacity="0">` +
        `<animate attributeName="x" from="${o.pad}" to="${o.pad + o.artW}" begin="${delay.toFixed(3)}s" ` +
        `dur="${rowDur.toFixed(2)}s" fill="freeze"/>` +
        `<set attributeName="opacity" to="0.85" begin="${delay.toFixed(3)}s"/>` +
        `<set attributeName="opacity" to="0" begin="${(delay + rowDur).toFixed(3)}s"/></rect>`
    );
  }

  // status bar with a steady blinking cursor
  const statusLineY = o.titlebarH + artH + o.pad * 0.35;
  const statusY = statusLineY + 19;
  p.push(
    `<line x1="0" y1="${statusLineY.toFixed(1)}" x2="${canvasW}" y2="${statusLineY.toFixed(1)}" stroke="${o.frame}"/>`
  );
  p.push(
    `<text x="${o.pad}" y="${statusY.toFixed(1)}" fill="${o.titleText}" font-size="13">` +
      `${esc(o.user)}:~$ whoami <tspan fill="${o.ink}">${esc(o.name)}</tspan></text>`
  );
  const statusChars = `${o.user}:~$ whoami ${o.name} `.length;
  p.push(
    `<rect x="${(o.pad + statusChars * 13 * 0.6).toFixed(1)}" y="${(statusY - 12).toFixed(1)}" ` +
      `width="8" height="14" fill="${o.ink}">` +
      `<animate attributeName="opacity" values="1;1;0;0" keyTimes="0;0.5;0.51;1" ` +
      `dur="1s" repeatCount="indefinite"/></rect>`
  );

  p.push("</svg>");
  return p.join("");
}
