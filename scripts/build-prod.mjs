/**
 * Production build script for electron-builder.
 *
 * Replicates the output structure produced by Forge's VitePlugin so that
 * package.json "main" field (.vite/build/main.js) works for both dev and prod.
 *
 * Output:
 *   .vite/build/main.js           – main process (CJS)
 *   .vite/build/preload.js        – preload script (CJS)
 *   .vite/build/preload-webview.js – webview preload (CJS)
 *   .vite/build/preload-board.js  – board webview preload (CJS)
 *   .vite/renderer/main_window/   – renderer (ESM, HTML entry)
 */

import { build } from "vite";
import { builtinModules } from "node:module";

const nodeExternals = [
    "electron",
    ...builtinModules,
    ...builtinModules.map((m) => `node:${m}`),
];

// Shared resolve config for main-process / preload targets.
// Forces Vite to pick "node" export conditions (e.g. when-exit ships
// separate browser/node builds; the browser build uses `window`).
const nodeResolve = {
    conditions: ["node"],
};

// ── 1. Main process ──────────────────────────────────────────────────

console.log("\n🔨 Building main process...");
await build({
    configFile: false,
    resolve: nodeResolve,
    build: {
        outDir: ".vite/build",
        emptyOutDir: true,
        minify: false,
        rollupOptions: {
            input: { main: "src/main.ts" },
            output: {
                format: "cjs",
                entryFileNames: "[name].js",
                chunkFileNames: "[name].js",
            },
            external: nodeExternals,
        },
    },
    define: {
        MAIN_WINDOW_VITE_DEV_SERVER_URL: "undefined",
        MAIN_WINDOW_VITE_NAME: JSON.stringify("main_window"),
    },
});

// ── 2. Preload ───────────────────────────────────────────────────────

console.log("\n🔨 Building preload...");
await build({
    configFile: false,
    build: {
        outDir: ".vite/build",
        emptyOutDir: false,
        minify: false,
        rollupOptions: {
            input: { preload: "src/preload.ts" },
            output: {
                format: "cjs",
                entryFileNames: "[name].js",
                chunkFileNames: "[name].js",
            },
            external: nodeExternals,
        },
    },
});

// ── 3. Preload-webview ───────────────────────────────────────────────

console.log("\n🔨 Building preload-webview...");
await build({
    configFile: false,
    build: {
        outDir: ".vite/build",
        emptyOutDir: false,
        minify: false,
        rollupOptions: {
            input: { "preload-webview": "src/preload-webview.ts" },
            output: {
                format: "cjs",
                entryFileNames: "[name].js",
                chunkFileNames: "[name].js",
            },
            external: nodeExternals,
        },
    },
});

// ── 3b. Preload-board ────────────────────────────────────────────────

console.log("\n🔨 Building preload-board...");
await build({
    configFile: false,
    build: {
        outDir: ".vite/build",
        emptyOutDir: false,
        minify: false,
        rollupOptions: {
            input: { "preload-board": "src/preload-board.ts" },
            output: {
                format: "cjs",
                entryFileNames: "[name].js",
                chunkFileNames: "[name].js",
            },
            external: nodeExternals,
        },
    },
});

// ── 4. Renderer ──────────────────────────────────────────────────────
//
// The renderer runs in Electron with nodeIntegration: true, so runtime
// require() calls (e.g. require("path"), require("fs")) work at runtime.
// Vite leaves CJS require() calls untouched in ESM output.
//
// Dependencies that use `import "buffer"` or `import "string_decoder"`
// resolve to npm polyfill packages in node_modules — no special handling
// needed. We do NOT externalize node builtins here (unlike main/preload)
// because ESM bare imports like `import "fs"` would fail in Chromium.

console.log("\n🔨 Building renderer...");
await build({
    configFile: "vite.renderer.config.ts",
    root: ".",
    base: "./",
    build: {
        outDir: ".vite/renderer/main_window",
        emptyOutDir: true,
        target: "esnext",
    },
});

console.log("\n✅ Production build complete.");
