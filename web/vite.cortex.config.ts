import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

/** Library build for embedding in DAO OS (Next.js). */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom"],
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/DAO-export.tsx"),
      name: "HermesDashboard",
      formats: ["es"],
      fileName: () => "hermes-dashboard.js",
    },
    rollupOptions: {
      external: (id) =>
        id === "react-router-dom" ||
        id === "react" ||
        id === "react-dom" ||
        id.startsWith("react/") ||
        id.startsWith("react-dom/"),
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
          "react-router-dom": "ReactRouterDOM",
        },
        assetFileNames: "hermes-dashboard.[ext]",
      },
    },
    outDir: "dist-DAO",
    emptyOutDir: true,
    cssCodeSplit: false,
  },
});
