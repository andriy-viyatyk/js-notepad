// Vite-injected globals for Electron Forge
// These are defined by @electron-forge/plugin-vite at build time

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

declare module "picomatch" {
    function picomatch(
        glob: string | string[],
        options?: { dot?: boolean }
    ): (input: string) => boolean;
    export = picomatch;
}
