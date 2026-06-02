import { defineConfig, Plugin } from 'vite';
import monacoEditorPlugin from 'vite-plugin-monaco-editor';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Vite plugin that copies .d.ts files from src/renderer/api/types/ to assets/editor-types/
 * and generates _imports.txt listing all type files for Monaco IntelliSense.
 *
 * Runs on dev server start, on build, and watches for changes in dev mode.
 */
function editorTypesPlugin(): Plugin {
  const srcDir = path.resolve(__dirname, 'src/renderer/api/types');
  const destDir = path.resolve(__dirname, 'assets/editor-types');

  function syncTypes() {
    if (!fs.existsSync(srcDir)) return;

    // Copy all .d.ts files from api/types/ to assets/editor-types/
    const srcFiles = fs.readdirSync(srcDir).filter(f => f.endsWith('.d.ts'));
    for (const file of srcFiles) {
      fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
    }

    // Generate _imports.txt from ALL .d.ts files in destination
    // (includes both copied files and manually maintained ones like page.d.ts)
    const allFiles = fs.readdirSync(destDir)
      .filter(f => f.endsWith('.d.ts'))
      .sort();

    // Put index.d.ts last since it imports the others
    const idx = allFiles.indexOf('index.d.ts');
    if (idx !== -1) {
      allFiles.splice(idx, 1);
      allFiles.push('index.d.ts');
    }

    fs.writeFileSync(path.join(destDir, '_imports.txt'), allFiles.join('\n') + '\n');
  }

  return {
    name: 'editor-types',

    // Runs on both dev and build
    buildStart() {
      syncTypes();
    },

    // Watch for changes in dev mode
    configureServer(server) {
      server.watcher.add(srcDir);
      server.watcher.on('change', (changedPath) => {
        if (changedPath.startsWith(srcDir) && changedPath.endsWith('.d.ts')) {
          syncTypes();
        }
      });
      server.watcher.on('add', (addedPath) => {
        if (addedPath.startsWith(srcDir) && addedPath.endsWith('.d.ts')) {
          syncTypes();
        }
      });
    },
  };
}

export default defineConfig({
  // Pin a dedicated dev-server port (Vite's default 5173 conflicts with another
  // local React app whose redirect URI is locked to that port in its app
  // registration). strictPort fails fast instead of hopping to 5174+, so the
  // URL stays deterministic.
  server: {
    port: 5273,
    strictPort: true,
  },
  plugins: [
    editorTypesPlugin(),
    monacoEditorPlugin({
      languageWorkers: ['typescript', 'editorWorkerService', 'json', 'html'],
    })
  ],
  build: {
    target: 'esnext',
  },
});
