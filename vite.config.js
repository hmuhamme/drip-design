import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig(({ mode }) => ({
  // "./" keeps asset paths relative so the build works from any subfolder
  // (GitHub Pages, a university web space, a USB stick).
  base: "./",
  plugins: [
    react(),
    tailwindcss(),
    // `npm run build:single` inlines everything into one self-contained
    // index.html that opens by double-click, no server needed.
    ...(mode === "single" ? [viteSingleFile()] : []),
  ],
  build: { outDir: mode === "single" ? "dist-single" : "dist" },
}));
