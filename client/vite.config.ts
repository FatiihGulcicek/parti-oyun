import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Geliştirmede socket.io ve /config isteklerini yerel sunucuya yönlendir
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      '/socket.io': { target: 'http://localhost:3001', ws: true },
      '/config': 'http://localhost:3001',
    },
  },
});
