import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/ask': 'http://localhost:8000',
      '/send-all': 'http://localhost:8000',
      '/check-story': 'http://localhost:8000',
    },
  },
});
