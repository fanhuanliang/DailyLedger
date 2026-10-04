import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], server: { host: '127.0.0.1', port: 5173, proxy: { '/api': 'http://127.0.0.1:5010' } }, test: { environment: 'jsdom', setupFiles: ['./tests/setup.ts'], clearMocks: true } });
