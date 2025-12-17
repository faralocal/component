import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/zog-component-plugin.js'),
      name: 'ZogComponent',
      fileName: (format) => `zog-component.${format}.js`,
      formats: ['es', 'umd'],
    },
    rollupOptions: {
      external: [],
      output: {
        globals: {},
      },
    },
    sourcemap: true,
    emptyOutDir: true,
  },
});
