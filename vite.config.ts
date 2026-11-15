import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

function sefazApiPlugin() {
  return {
    name: 'sefaz-api-middleware',
    configureServer(server: any) {
      const mountApi = (route: string, modulePath: string) => {
        server.middlewares.use(route, async (req: any, res: any) => {
          let body = '';
          req.on('data', (chunk: any) => {
            body += chunk;
          });
          req.on('end', async () => {
            try {
              req.body = body ? JSON.parse(body) : {};
            } catch {
              req.body = {};
            }
            const customRes = {
              setHeader: (k: string, v: string) => res.setHeader(k, v),
              status: (code: number) => {
                res.statusCode = code;
                return customRes;
              },
              json: (data: any) => {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(data));
              },
              end: () => res.end()
            };
            try {
              const mod = await import(modulePath);
              const handler = mod.default || mod;
              await handler(req, customRes);
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
          });
        });
      };

      mountApi('/api/fetch-sefaz', './api/fetch-sefaz.js');
      mountApi('/api/extract-receipt', './api/extract-receipt.js');
    }
  };
}

export default defineConfig({
  server: {
    host: true,
    port: 5173
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          supabase: ['@supabase/supabase-js'],
          db: ['dexie', 'dexie-react-hooks'],
          scanner: ['jsqr', 'zxing-wasm/reader']
        }
      }
    }
  },
  plugins: [
    react(),
    sefazApiPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'pwa-192x192.svg', 'pwa-512x512.svg', 'wasm/zxing_reader.wasm'],
      manifest: {
        name: 'OrganoCasa - Lista de Compras & Casa',
        short_name: 'OrganoCasa',
        description: 'Lista de compras inteligente para supermercado, conciliação de NF e lembretes da casa',
        theme_color: '#10b981',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/pwa-192x192.svg',
            sizes: '192x192',
            type: 'image/svg+xml'
          },
          {
            src: '/pwa-512x512.svg',
            sizes: '512x512',
            type: 'image/svg+xml'
          },
          {
            src: '/pwa-512x512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ],
        shortcuts: [
          {
            name: 'Ler Nota Fiscal',
            short_name: 'Ler NF',
            description: 'Escanear QR Code ou foto de cupom fiscal',
            url: '/?action=scan',
            icons: [{ src: '/pwa-192x192.svg', sizes: '192x192' }]
          },
          {
            name: 'Lembretes da Casa',
            short_name: 'Lembretes',
            description: 'Ver afazeres e itens da sogra/família',
            url: '/?tab=reminders',
            icons: [{ src: '/pwa-192x192.svg', sizes: '192x192' }]
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,wasm}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/api/]
      }
    })
  ]
});
