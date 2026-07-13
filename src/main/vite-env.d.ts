// Vite-injected globals. Defined at build time via `define` by scripts/dev.mjs
// (dev — real dev-server URL) and scripts/build-prod.mjs (prod — undefined).

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

declare module "picomatch" {
    function picomatch(
        glob: string | string[],
        options?: { dot?: boolean }
    ): (input: string) => boolean;
    export = picomatch;
}
