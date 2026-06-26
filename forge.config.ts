import type { ForgeConfig } from "@electron-forge/shared-types";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { FuseV1Options, FuseVersion } from "@electron/fuses";

const config: ForgeConfig = {
    packagerConfig: {
        asar: true,
        extraResource: ["./assets"],
        icon: "./assets/icon.ico",
    },
    rebuildConfig: {},
    makers: [],
    plugins: [
        new VitePlugin({
            build: [
                {
                    entry: "src/main.ts",
                    config: "vite.main.config.ts",
                    target: "main",
                },
                {
                    entry: "src/preload.ts",
                    config: "vite.preload.config.ts",
                    target: "preload",
                },
                {
                    entry: "src/preload-webview.ts",
                    config: "vite.preload-webview.config.ts",
                    target: "preload",
                },
                {
                    // Board bridge shim (EPIC-037 / US-771) — inlined into board HTML
                    // by the board:// handler, NOT loaded by Electron as a preload.
                    entry: "src/board-shim.ts",
                    config: "vite.board-shim.config.ts",
                    target: "preload",
                },
            ],
            renderer: [
                {
                    name: "main_window",
                    config: "vite.renderer.config.ts",
                },
            ],
        }),
        // Fuses are used to enable/disable various Electron functionality
        // at package time, before code signing the application
        new FusesPlugin({
            version: FuseVersion.V1,
            [FuseV1Options.RunAsNode]: false,
            [FuseV1Options.EnableCookieEncryption]: false,
            [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
            [FuseV1Options.EnableNodeCliInspectArguments]: false,
            [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
            [FuseV1Options.OnlyLoadAppFromAsar]: true,
        }),
    ],
};

export default config;
