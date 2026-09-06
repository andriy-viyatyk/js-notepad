/**
 * Development script — Forge-free replacement for `electron-forge start`.
 *
 * Replicates what @electron-forge/plugin-vite did at dev time, using the Vite
 * JS API directly (the same way scripts/build-prod.mjs drives production):
 *
 *   1. Start a Vite dev server for the renderer (HMR).
 *   2. Build main / preload / preload-webview / board-shim / search-worker in watch mode,
 *      injecting the dev-server URL so the main process loads the renderer
 *      over http:// (see src/main/open-window.ts).
 *   3. Launch Electron; restart it whenever a main/preload bundle changes.
 *      Renderer edits are picked up by Vite HMR — no Electron restart.
 *
 * Output layout matches build-prod.mjs and package.json "main":
 *   .vite/build/main.js, preload.js, preload-webview.js, board-shim.js, search-worker.js
 *   renderer served from the dev server at MAIN_WINDOW_VITE_DEV_SERVER_URL
 */

import { createServer, build } from "vite";
import { spawn } from "node:child_process";
import { builtinModules } from "node:module";
import { rmSync } from "node:fs";
import electronPath from "electron";

const nodeExternals = [
    "electron",
    ...builtinModules,
    ...builtinModules.map((m) => `node:${m}`),
];

// ── Build configs (mirror build-prod.mjs, but watch mode + dev define) ──────

function mainConfig(devServerUrl) {
    return {
        configFile: false,
        mode: "development",
        resolve: { conditions: ["node"] },
        // Mark this as a Node build. Without it Vite treats the main process as a browser
        // bundle and statically replaces every `process.env` with `{}`, so main-process
        // environment reads silently become undefined and `{ ...process.env }` spreads to
        // nothing — which stripped the parent environment from every spawned child process.
        // Found by EPIC-090's gate, where PERSEPHONE_MCP_CALL_ONLY could never turn on.
        ssr: { target: "node" },
        build: {
            ssr: true,
            outDir: ".vite/build",
            emptyOutDir: false,
            minify: false,
            sourcemap: true,
            watch: {},
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
            MAIN_WINDOW_VITE_DEV_SERVER_URL: JSON.stringify(devServerUrl),
            MAIN_WINDOW_VITE_NAME: JSON.stringify("main_window"),
        },
    };
}

function preloadConfig(input) {
    return {
        configFile: false,
        mode: "development",
        build: {
            outDir: ".vite/build",
            emptyOutDir: false,
            minify: false,
            sourcemap: true,
            watch: {},
            rollupOptions: {
                input,
                output: {
                    format: "cjs",
                    entryFileNames: "[name].js",
                    chunkFileNames: "[name].js",
                },
                external: nodeExternals,
            },
        },
    };
}

function boardShimConfig() {
    return {
        configFile: false,
        mode: "development",
        build: {
            outDir: ".vite/build",
            emptyOutDir: false,
            minify: false,
            sourcemap: true,
            watch: {},
            rollupOptions: {
                input: { "board-shim": "src/board-shim.ts" },
                output: {
                    format: "iife",
                    entryFileNames: "[name].js",
                    chunkFileNames: "[name].js",
                },
            },
        },
    };
}

// The search walk runs in a worker_thread. search-service.ts reads this bundle as
// SOURCE and runs it with `{ eval: true }`, so every surviving require() must be a
// node builtin — npm deps (picomatch) MUST stay bundled in. Do not widen `external`.
function searchWorkerConfig() {
    return {
        configFile: false,
        mode: "development",
        resolve: { conditions: ["node"] },
        build: {
            outDir: ".vite/build",
            emptyOutDir: false,
            minify: false,
            sourcemap: true,
            watch: {},
            rollupOptions: {
                input: { "search-worker": "src/main/search-worker.ts" },
                output: {
                    format: "cjs",
                    entryFileNames: "[name].js",
                    chunkFileNames: "[name].js",
                },
                external: nodeExternals,
            },
        },
    };
}

// ── Electron process lifecycle ──────────────────────────────────────────────

let electronProc = null;
let restarting = false;
let restartTimer = null;
let shuttingDown = false;
const watchers = [];
let server = null;

function startElectron() {
    electronProc = spawn(electronPath, ["."], {
        stdio: "inherit",
        env: { ...process.env },
    });
    electronProc.on("close", (code) => {
        electronProc = null;
        // If Electron exited on its own (user closed the app) — not because we
        // killed it to restart — tear everything down.
        if (!restarting && !shuttingDown) {
            shutdown(code ?? 0);
        }
    });
}

function restartElectron() {
    if (shuttingDown) return;
    if (electronProc) {
        restarting = true;
        electronProc.once("close", () => {
            restarting = false;
            if (!shuttingDown) startElectron();
        });
        electronProc.kill();
    } else {
        startElectron();
    }
}

// Multiple watchers may rebuild for a single edit — debounce the restart.
function scheduleRestart() {
    if (shuttingDown) return;
    if (restartTimer) clearTimeout(restartTimer);
    restartTimer = setTimeout(() => {
        restartTimer = null;
        console.log("\x1b[36m[dev]\x1b[0m main/preload changed — restarting Electron");
        restartElectron();
    }, 150);
}

// Start a watch-mode build. Resolves once the initial bundle is written.
// `restartOnChange` triggers an Electron restart on subsequent rebuilds.
function watchBuild(name, config, { restartOnChange }) {
    return new Promise((resolve) => {
        let firstDone = false;
        const done = () => {
            if (!firstDone) {
                firstDone = true;
                resolve();
            }
        };
        build(config).then((watcher) => {
            watchers.push(watcher);
            watcher.on("event", (event) => {
                if (event.code === "BUNDLE_END") {
                    event.result?.close?.();
                } else if (event.code === "END") {
                    if (firstDone && restartOnChange) scheduleRestart();
                    done();
                } else if (event.code === "ERROR") {
                    console.error(
                        `\x1b[31m[dev]\x1b[0m ${name} build error: ${event.error?.message ?? event.error}`,
                    );
                    done();
                }
            });
        });
    });
}

function shutdown(code) {
    if (shuttingDown) return;
    shuttingDown = true;
    if (restartTimer) clearTimeout(restartTimer);
    for (const w of watchers) {
        try {
            w.close();
        } catch {
            /* ignore */
        }
    }
    if (server) server.close().catch(() => {});
    if (electronProc) {
        try {
            electronProc.kill();
        } catch {
            /* ignore */
        }
    }
    process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

// ── Main ──────────────────────────────────────────────────────────────────

// Clean stale build output once (concurrent watchers can't share emptyOutDir).
rmSync(".vite/build", { recursive: true, force: true });

console.log("\x1b[36m[dev]\x1b[0m Starting renderer dev server...");
server = await createServer({
    configFile: "vite.renderer.config.ts",
    mode: "development",
});
await server.listen();
server.printUrls();

const devServerUrl = server.resolvedUrls?.local?.[0] ?? "http://localhost:5273/";
console.log(`\x1b[36m[dev]\x1b[0m Renderer at ${devServerUrl}`);

console.log("\x1b[36m[dev]\x1b[0m Building main / preload / board-shim / search-worker (watch)...");
await Promise.all([
    watchBuild("main", mainConfig(devServerUrl), { restartOnChange: true }),
    watchBuild("preload", preloadConfig({ preload: "src/preload.ts" }), { restartOnChange: true }),
    watchBuild("preload-webview", preloadConfig({ "preload-webview": "src/preload-webview.ts" }), { restartOnChange: true }),
    // board-shim is read fresh from disk by the board:// handler on each board
    // load, so a rebuild does not require an Electron restart.
    watchBuild("board-shim", boardShimConfig(), { restartOnChange: false }),
    // search-worker is likewise re-read from disk per search in dev (getWorkerSource
    // only caches when packaged), so a rebuild needs no Electron restart either.
    watchBuild("search-worker", searchWorkerConfig(), { restartOnChange: false }),
]);

console.log("\x1b[36m[dev]\x1b[0m Launching Electron...");
startElectron();
