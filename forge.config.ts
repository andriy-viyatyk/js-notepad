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
    makers: [
        {
            name: "@electron-forge/maker-wix",
            config: {
                language: 1033,
                manufacturer: "Andriy Viyatyk",
                name: "JS-Notepad",
                description: "JS-Notepad",
                upgradeCode: "d2f1c1e4-5b6c-7c7d-9e0f-1a2b3c4d9e6f",
                ui: {
                    chooseDirectory: true,
                },
                associateExtensions:
                    "txt,log,md,js,ts,jsx,tsx,json,xml,html,css,py,java,c,cpp",
                shortcutFolderName: "JS-Notepad",
            },
        },
        {
            name: "@electron-forge/maker-zip",
            platforms: ["win32"],
            config: {},
        },
    ],
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
            [FuseV1Options.EnableCookieEncryption]: true,
            [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
            [FuseV1Options.EnableNodeCliInspectArguments]: false,
            [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
            [FuseV1Options.OnlyLoadAppFromAsar]: true,
        }),
    ],
    publishers: [
        {
            name: "@electron-forge/publisher-github",
            config: {
                repository: {
                    owner: "andriy-viyatyk",
                    name: "js-notepad",
                },
                prerelease: false,
                draft: true, // Highly recommended: creates the release but doesn't show it to users until you check it
            },
        },
    ],
};

export default config;
