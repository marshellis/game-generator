import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import vercel from "@astrojs/vercel";

export default defineConfig({
  site: "https://games.marshellis.com",
  output: "static", // Astro 5: static + per-route `prerender = false` is the old "hybrid"
  adapter: vercel(),
  vite: {
    plugins: [tailwindcss()],
  },
});
