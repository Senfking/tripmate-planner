import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { build as viteBuild } from "vite";
import fs from "fs";

const buildTimestamp = Date.now().toString(36);

/**
 * Vite plugin that builds the service worker after the main bundle,
 * injecting the list of hashed asset filenames so the SW can precache them.
 */
function serviceWorkerPlugin(): Plugin {
  return {
    name: "build-service-worker",
    apply: "build",
    closeBundle: {
      sequential: true,
      order: "post",
      async handler() {
        const distDir = path.resolve(__dirname, "dist");
        const assetsDir = path.join(distDir, "assets");

        // Collect all hashed asset filenames emitted by the main build
        let precacheUrls: string[] = ["/", "/index.html", "/manifest.json"];
        if (fs.existsSync(assetsDir)) {
          const files = fs.readdirSync(assetsDir);
          for (const f of files) {
            if (/\.(js|css)$/.test(f)) {
              precacheUrls.push(`/assets/${f}`);
            }
          }
        }

        // Build the service worker as an IIFE bundle
        await viteBuild({
          configFile: false,
          build: {
            emptyOutDir: false,
            outDir: distDir,
            lib: {
              entry: path.resolve(__dirname, "src/service-worker.ts"),
              formats: ["iife"],
              name: "sw",
              fileName: () => "service-worker.js",
            },
            rollupOptions: {
              output: { inlineDynamicImports: true },
            },
            minify: true,
          },
          define: {
            __BUILD_TS__: JSON.stringify(buildTimestamp),
            __PRECACHE_URLS__: JSON.stringify(precacheUrls),
          },
        });
      },
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    __BUILD_TS__: JSON.stringify(buildTimestamp),
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    serviceWorkerPlugin(),
  ].filter(Boolean),
  optimizeDeps: {
    include: ['react', 'react-dom', 'react/jsx-runtime', '@tanstack/react-query'],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
}));
