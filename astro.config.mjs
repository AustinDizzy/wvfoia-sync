// @ts-check
import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';

import cloudflare from '@astrojs/cloudflare';
import { BASE_URL } from "./app-paths.mjs";

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  base: BASE_URL,

  adapter: cloudflare({
    platformProxy: {
      enabled: true
    },

    imageService: "cloudflare"
  }),

  session: {
    driver: "memory"
  },

  vite: {
    resolve: {
      alias: {
        '$': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    plugins: [tailwindcss()]
  }
});
