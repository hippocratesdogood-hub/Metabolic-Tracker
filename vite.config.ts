import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { metaImagesPlugin } from "./vite-plugin-meta-images";

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    tailwindcss(),
    metaImagesPlugin(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  css: {
    postcss: {
      plugins: [],
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Vendor chunks - split large dependencies
          if (id.includes("node_modules")) {
            // Large PDF/export libraries - lazy loaded
            if (id.includes("jspdf") || id.includes("html2canvas") || id.includes("dompurify")) {
              return "vendor-pdf";
            }
            // Charting library
            if (id.includes("recharts") || id.includes("d3-")) {
              return "vendor-charts";
            }
            // Sentry monitoring
            if (id.includes("@sentry")) {
              return "vendor-sentry";
            }
            // Form handling
            if (id.includes("react-hook-form") || id.includes("@hookform") || id.includes("zod")) {
              return "vendor-forms";
            }
            // React Query
            if (id.includes("@tanstack")) {
              return "vendor-query";
            }
            // Core React
            if (id.includes("react") || id.includes("scheduler")) {
              return "vendor-react";
            }
          }
        },
      },
    },
    // Increase chunk size warning limit for PDF exports
    chunkSizeWarningLimit: 600,
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
