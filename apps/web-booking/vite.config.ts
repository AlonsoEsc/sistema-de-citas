import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          icons: ["lucide-react"],
          query: ["@tanstack/react-query", "axios"],
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
  },
});
