import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import vercel from "@astrojs/vercel/serverless";

export default defineConfig({
  site: "https://games.marshellis.com",
  output: "hybrid",
  adapter: vercel(),
  vite: {
    plugins: [tailwindcss()],
  },
});
