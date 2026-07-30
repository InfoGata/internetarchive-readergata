// vite.config.ts
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
export default defineConfig({
  plugins: [tailwindcss(), preact(), viteSingleFile()],
  root: path.resolve(__dirname, './src'),
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./src"),
    }
  },
  build: {
    outDir: '../dist',
    emptyOutDir: false,
    rollupOptions: {
      input: {
        options: path.resolve(__dirname, './src/options.html'),
      },
    }
  }
});
