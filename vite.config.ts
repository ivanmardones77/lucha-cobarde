import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import fs from 'fs';
import { defineConfig, type Plugin } from 'vite';

/** Solo en desarrollo: deja que tools/bake guarde las hojas de sprites en src/assets/sprites/baked. */
function bakeSink(): Plugin {
  return {
    name: 'bake-sink',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__bake/save', (req, res) => {
        const rel = new URL(req.url ?? '', 'http://x').searchParams.get('path') ?? '';
        if (req.method !== 'POST' || !/^[a-z0-9_]+(\/[a-z0-9_]+)*\.(webp|png|json)$/.test(rel)) {
          res.statusCode = 400;
          res.end('bad request');
          return;
        }
        const chunks: Buffer[] = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          const out = path.resolve(__dirname, 'src/assets/sprites/baked', rel);
          fs.mkdirSync(path.dirname(out), { recursive: true });
          fs.writeFileSync(out, Buffer.concat(chunks));
          res.end('ok');
        });
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  // Rutas relativas en build para servir desde GitHub Pages (/lucha-cobarde/)
  base: command === 'build' ? './' : '/',
  plugins: [tailwindcss(), bakeSink()],
  // Las hojas horneadas se reescriben una a una: sin esto cada guardado recarga la página de bake en bucle
  server: { watch: { ignored: ['**/src/assets/sprites/baked/**'] } },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
}));
