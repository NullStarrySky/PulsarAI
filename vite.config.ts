import { defineConfig } from "vite";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";

// @ts-expect-error process is a nodejs global
const devHost = process.env.TAURI_DEV_HOST;
// @ts-expect-error process is a nodejs global
const hostTarget = process.env.PULSAR_HOST ?? (process.env.TAURI_ENV_PLATFORM ? "mobile-tauri" : "desktop-electron");

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      "@/host": path.resolve(__dirname, "./host/index.ts"),
      "@": path.resolve(__dirname, "./src"),
      "@host-target": path.resolve(__dirname, `./host/${hostTarget}/index.ts`),
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: devHost || false,
    hmr: devHost
      ? {
          protocol: "ws",
          host: devHost,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/host/mobile-tauri/**", "**/host/desktop-electron/**"],
    },
  },
}));
