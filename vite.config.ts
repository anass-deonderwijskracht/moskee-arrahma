import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // De CSS gebruikt al :has() en oklch(); die vragen Safari 15.4+ /
    // Chrome 111+. De standaard van Vite (safari14) suggereert onterecht dat
    // oudere browsers werken — daar valt de opmaak stil uit elkaar.
    target: ["es2022", "safari15.4", "chrome111", "firefox113", "edge111"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
} as any);
