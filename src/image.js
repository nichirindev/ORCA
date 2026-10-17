/**
 * Browser port of prep_photo.py:
 *   1. knock out the solid background by colour distance from the corners,
 *   2. crop square and centre on the subject with padding,
 *   3. hand back a canvas ready to be sampled down to the ASCII grid.
 *
 * If the background is not actually solid (a normal photo), we detect that and
 * fall back to photo mode instead of producing a wrecked cutout.
 */

const MAX_WORK = 1280; // working resolution cap; keeps pixel loops fast

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode that image."));
    img.src = src;
  });
}

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** Average RGB of small patches in all four corners (denoised corner sample). */
function cornerAverage(d, w, h) {
  const s = Math.max(2, Math.round(Math.min(w, h) * 0.02));
  const spots = [
    [0, 0],
    [w - s, 0],
    [0, h - s],
    [w - s, h - s],
  ];
  let r = 0, g = 0, b = 0, n = 0;
  for (const [x0, y0] of spots) {
    for (let y = y0; y < y0 + s; y++) {
      for (let x = x0; x < x0 + s; x++) {
        const o = (y * w + x) * 4;
        r += d[o];
        g += d[o + 1];
        b += d[o + 2];
        n++;
      }
    }
  }
  return [r / n, g / n, b / n];
}

/**
 * @param {HTMLImageElement} img
 * @param {{removeBg?: boolean, threshold?: number}} opts
 * @returns {{canvas: HTMLCanvasElement, mode: "light"|"dark", note: string}}
 */
export function prepare(img, opts = {}) {
  const { removeBg = true, threshold = 26 } = opts;

  const scale = Math.min(1, MAX_WORK / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const work = makeCanvas(w, h);
  const ctx = work.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);

  if (!removeBg) {
    return { canvas: work, mode: "dark", note: "" };
  }

  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;
  const bg = cornerAverage(d, w, h);

  let kept = 0;
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const dr = d[o] - bg[0];
    const dg = d[o + 1] - bg[1];
    const db = d[o + 2] - bg[2];
    if (Math.sqrt(dr * dr + dg * dg + db * db) < threshold) {
      d[o + 3] = 0;
    } else {
      kept++;
    }
  }
  const coverage = kept / (w * h);

  if (coverage > 0.97) {
    return {
      canvas: work,
      mode: "dark",
      note: "No solid background detected — using photo mode (bright areas wash to blank).",
    };
  }
  if (coverage < 0.03) {
    return {
      canvas: work,
      mode: "dark",
      note: "Corner colour matched almost everything — using photo mode instead.",
    };
  }

  // bounding box around the subject (alpha > 0)
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) {
    return { canvas: work, mode: "dark", note: "Cutout failed — using photo mode." };
  }

  // crop around the subject keeping ITS proportions (+4% padding per side).
  // The art's aspect ratio follows this crop — not a forced square.
  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  const padX = Math.round(bw * 0.04);
  const padY = Math.round(bh * 0.04);
  const sx0 = Math.max(0, minX - padX);
  const sy0 = Math.max(0, minY - padY);
  const sx1 = Math.min(w, maxX + 1 + padX);
  const sy1 = Math.min(h, maxY + 1 + padY);
  const cropW = sx1 - sx0;
  const cropH = sy1 - sy0;

  const out = makeCanvas(cropW, cropH);
  const cropped = out.getContext("2d").createImageData(cropW, cropH);
  for (let y = 0; y < cropH; y++) {
    const src = ((sy0 + y) * w + sx0) * 4;
    cropped.data.set(d.subarray(src, src + cropW * 4), y * cropW * 4);
  }
  out.getContext("2d").putImageData(cropped, 0, 0);

  return {
    canvas: out,
    mode: "light",
    note: `Background removed (${Math.round((1 - coverage) * 100)}% of pixels cleared).`,
  };
}

/**
 * Downscale a canvas/image to the COLS x ROWS ASCII grid.
 * Progressive halving keeps the small final step from eating fine detail.
 */
export function sampleToGrid(source, cols, rows) {
  let src = source;
  let w = source.width;
  let h = source.height;
  while (w > cols * 4 && h > rows * 4 && w > 8 && h > 8) {
    const half = makeCanvas(Math.max(cols, w >> 1), Math.max(rows, h >> 1));
    const hx = half.getContext("2d", { willReadFrequently: true });
    hx.imageSmoothingEnabled = true;
    hx.imageSmoothingQuality = "high";
    hx.drawImage(src, 0, 0, half.width, half.height);
    src = half;
    w = half.width;
    h = half.height;
  }

  const out = makeCanvas(cols, rows);
  const ctx = out.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, cols, rows);
  const id = ctx.getImageData(0, 0, cols, rows);
  return { width: cols, height: rows, data: id.data };
}
