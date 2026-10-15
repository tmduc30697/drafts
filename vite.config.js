import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// App được host tại https://tmduc30697.github.io/drafts/ nên base phải là /drafts/
export default defineConfig({
  base: '/drafts/',
  plugins: [react()],
});
