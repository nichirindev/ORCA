/**
 * Image grid -> ASCII text rows.
 *
 * One density ramp, one ink color: monochrome is deliberate, per-character
 * rainbow color is what makes ASCII portraits look noisy.
 *
 * Two tonal modes:
 *   "light"  cutout mode (background knocked out via alpha). Bright pixels
 *            become dense marks, so a light subject reads correctly as
 *            light-on-dark against the terminal background.
 *   "dark"   photo mode. Dark pixels become dense marks and anything brighter
 *            than whiteFloor washes out to blank, so a busy bright background
 *            disappears.
 * "invert" flips whichever mode is active (handy for a dark photo background).
 */

// dense where the input is bright; leading space keeps cleared pixels invisible
export const DEFAULT_RAMP = " .`:-=+*cs#%@";

export function gridToRows(grid, opts = {}) {
  const {
    ramp = DEFAULT_RAMP,
    mode = "dark", // "light" | "dark"
    invert = false,
    contrast = 1.05,
    brightness = 1.0,
    gamma = 1.18,
    whiteFloor = 0.8,
    alphaThreshold = 64,
  } = opts;

  const { width: cols, height: rows, data } = grid;
  const code = ramp.length >= 2 ? ramp : DEFAULT_RAMP;
  const last = code.length - 1;
  const count = cols * rows;

  // 1. luminance (ITU-R BT.601)
  const lum = new Float32Array(count);
  let sum = 0;
  for (let i = 0; i < count; i++) {
    const o = i * 4;
    const v = (0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]) / 255;
    lum[i] = v;
    sum += v;
  }

  // 2. global tuning with PIL ImageEnhance semantics:
  //    brightness: o = i * b, then contrast: o = mean + (i - mean) * c,
  //    where the mean is taken on the brightness-adjusted image.
  const mean = (sum / count) * brightness;

  const out = new Array(rows);
  for (let y = 0; y < rows; y++) {
    let line = "";
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;

      // transparent pixels are always blank (cutout background)
      if (data[i * 4 + 3] < alphaThreshold) {
        line += " ";
        continue;
      }

      let v = lum[i] * brightness;
      v = mean + (v - mean) * contrast;
      v = v < 0 ? 0 : v > 1 ? 1 : v;
      v = Math.pow(v, gamma);

      let density;
      if (mode === "light") {
        density = v;
      } else {
        // photo mode: bright washes out to blank before mapping
        if (!invert && v >= whiteFloor) {
          line += " ";
          continue;
        }
        density = 1 - v;
      }
      if (invert) density = 1 - density;

      let idx = Math.round(density * last);
      idx = idx < 0 ? 0 : idx > last ? last : idx;
      line += code[idx];
    }
    out[y] = line;
  }
  return out;
}

/** Compact description of what the grid looks like, for the stats line. */
export function rowsStats(rowsTxt) {
  let marks = 0;
  for (const line of rowsTxt) {
    for (let i = 0; i < line.length; i++) if (line[i] !== " ") marks++;
  }
  const total = rowsTxt.length * (rowsTxt[0]?.length || 0);
  return { marks, total, fill: total ? marks / total : 0 };
}
