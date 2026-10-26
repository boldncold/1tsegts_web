import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv, type Plugin} from 'vite';

/**
 * Adds a preconnect to the Convex deployment the build talks to. Every page
 * opens a connection to it and every dish photo is served from it, so starting
 * the DNS + TLS handshake while the JS is still downloading saves a full
 * round trip to eu-west-1, the slowest hop for visitors in Mongolia.
 * Two hints because photos load without CORS and API calls load with it,
 * and browsers keep separate connections for the two.
 */
function preconnectConvex(convexUrl: string | undefined): Plugin {
  return {
    name: 'preconnect-convex',
    transformIndexHtml() {
      if (!convexUrl) return [];
      const origin = new URL(convexUrl).origin;
      return [
        {tag: 'link', attrs: {rel: 'preconnect', href: origin}, injectTo: 'head-prepend'},
        {tag: 'link', attrs: {rel: 'preconnect', href: origin, crossorigin: ''}, injectTo: 'head-prepend'},
      ];
    },
  };
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss(), preconnectConvex(env.VITE_CONVEX_URL)],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          // Libraries change far less often than our own code. In their own
          // files, a routine deploy only replaces the small app file and
          // returning visitors keep the libraries cached.
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/.test(id)) return 'react';
            if (/[\\/]node_modules[\\/](convex|@convex-dev)[\\/]/.test(id)) return 'convex';
            if (/[\\/]node_modules[\\/](motion|framer-motion|motion-dom|motion-utils)[\\/]/.test(id)) return 'motion';
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify: file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
