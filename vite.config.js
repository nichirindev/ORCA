import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// multi-page: the converter + the portfolio gallery
export default defineConfig({
  base: "./", // works from any sub-path (GitHub Pages, file share, ...)
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        gallery: fileURLToPath(new URL("./gallery.html", import.meta.url)),
      },
    },
  },
});
