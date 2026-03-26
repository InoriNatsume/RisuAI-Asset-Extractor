import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  build: {
    chunkSizeWarningLimit: 900
  },
  test: {
    include: ['tests/*.test.ts', 'src/**/*.test.ts'],
    globals: true,
    environment: 'jsdom'
  }
});
