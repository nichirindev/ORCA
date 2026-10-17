# ascii.term

Turn a portrait photo into a **clean, monochrome ASCII-art SVG** that "types"
itself in like a terminal — one light-gray ink color on a dark window, subject
isolated, each row wiping left-to-right behind a block cursor that rasters from
top to bottom, then the whole thing freezes and just holds.

This is a browser port of the original Python pipeline
(`prep_photo.py` + `make_ascii_svg.py`, Andrew6rant-style). Everything runs
client-side: your photo never leaves your machine.

## Quick start

```bash
npm install
npm run dev      # converter at http://localhost:5173
npm run build    # static site in dist/ (deploy anywhere, incl. GitHub Pages)
npm run check    # static check: every DOM id referenced in JS exists in the HTML
npm run test:e2e # real-Chrome test: boots the site, uploads a PNG, saves to gallery
```

Pages:

- **Converter** (`index.html`) — upload / paste / drop a photo, tune the
  density ramp, download the SVG.
- **My portraits** (`gallery.html`) — the portfolio. Anything you hit
  *Save to gallery* on is kept in your browser's localStorage and plays its
  typing animation as you scroll.

## How it works

1. **Prep** (port of `prep_photo.py`) — background pixels are knocked out by
   color distance from the image corners, then the subject is cropped around
   its bounding box (padding included, proportions kept). If the background
   isn't actually solid (a normal photo), it auto-falls back to photo mode.
2. **Sample** (port of the first half of `make_ascii_svg.py`) — the image is
   downscaled to a `COLS × ROWS` grid: columns are your setting (180 by
   default), **rows follow the image's aspect ratio**, so the finished art
   keeps the source's proportions (character cells stay 1:1.875, so faces
   aren't distorted). Each cell becomes one character from a density ramp
   `` .`:-=+*cs#%@``:
   - cutout mode: bright pixels → dense marks (a light subject reads light-on-dark)
   - photo mode: dark pixels → dense marks, anything brighter than the
     *white floor* washes out to blank, so a busy bright background disappears
3. **Assemble** (port of the second half) — one `<text>` per row, all the same
   fill color, plus SMIL `clipPath` wipes and cursors.

## Why it looks neat

- **One color.** Per-character rainbow coloring is what makes ASCII portraits
  look noisy. A single gray (`#c9d1d9`) over a dark window reads as legible type.
- **A good ramp + high contrast.** The ramp's first character is a space, and
  the washout floor erases highlights/background — busy areas go blank instead
  of going to mush.
- **SMIL, not JS.** GitHub renders SVGs embedded via `<img>` and runs their
  SMIL animations there — JS does not run. So the reveal is pure
  `<animate>`/`<set>`: each row gets a left-to-right clip wipe with a block
  cursor riding the wipe edge, staggered top → bottom. The portrait prints once
  in ~6 seconds and freezes (`fill="freeze"`).
  In the app, the live preview is the exact same SVG in an `<img>`, so what you
  see is what you download.

## Credits

- Style inspired by [Andrew6rant](https://github.com/Andrew6rant)'s ASCII portraits.
- Original Python pipeline by the repo author; this is the JS/Vite port.
