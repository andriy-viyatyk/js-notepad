import { defineConfig } from 'vite';

// The board bridge shim (EPIC-037 / US-771) is inlined as a CLASSIC <script> into
// board HTML by the board:// handler, and must run synchronously before the first
// author script. So it builds as a self-contained browser IIFE (not the CJS the
// preload target defaults to) — overriding the output format here.
export default defineConfig({
    build: {
        rollupOptions: {
            output: {
                format: 'iife',
                inlineDynamicImports: true,
            },
        },
    },
});
