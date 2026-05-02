import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { build as viteBuild } from "vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";
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
export default defineConfig(({ mode }) => {
  // Sentry sourcemap upload is opt-in: only runs when SENTRY_AUTH_TOKEN is set.
  // Without it, builds proceed normally (sourcemaps are still emitted to dist
  // so the next build with the token will upload them).
  const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;
  const enableSentryUpload = mode === "production" && Boolean(sentryAuthToken);

  return {
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
    build: {
      // Required for Sentry to symbolicate stack traces. Without this the
      // captured stacks show minified names like "Dg" (JUNTO-3) and are
      // effectively unreadable. "hidden" emits .map files (so the Sentry
      // plugin can upload them) without injecting sourceMappingURL comments,
      // so browsers don't auto-load them and source isn't leaked publicly.
      sourcemap: "hidden",
    },
    plugins: [
      react(),
      mode === "development" && componentTagger(),
      serviceWorkerPlugin(),
      enableSentryUpload &&
        sentryVitePlugin({
          authToken: sentryAuthToken,
          org: "junto-0n",
          project: "junto",
          release: { name: buildTimestamp },
        }),
    ].filter(Boolean),
    optimizeDeps: {
      include: ['react', 'react-dom', 'react/jsx-runtime', '@tanstack/react-query'],
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        // Force a single copy of react-query. A peer-dep mismatch between
        // react-query and react-query-persist-client could otherwise install two
        // copies, leaving useQueryClient() consumers reading from a different
        // React context than <PersistQueryClientProvider> set — surfacing as
        // "No QueryClient set" only in production builds.
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
  };
});
