import { defineConfig } from 'vite';
const proxy = { '/api/v1': 'http://127.0.0.1:5050' };
export default defineConfig({ server: { proxy }, preview: { proxy } });
