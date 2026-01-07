import { defineConfig } from 'vite';
import monacoEditorPlugin from 'vite-plugin-monaco-editor';

export default defineConfig({
  plugins: [
    monacoEditorPlugin({
      languageWorkers: ['typescript', 'editorWorkerService', 'json', 'html'],
    })
  ],
  build: {
    target: 'esnext',
  },
});
