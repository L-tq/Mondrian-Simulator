import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: '/Mondrian-Simulator/',
  build: {
    outDir: 'docs',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        simulator: resolve(__dirname, 'simulator.html'),
      },
    },
  },
});
