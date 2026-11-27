import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  // Rutas relativas en build para servir desde GitHub Pages (/lucha-cobarde/)
  base: command === 'build' ? './' : '/',
  plugins: [tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
}));
