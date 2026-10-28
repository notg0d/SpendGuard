import { build } from 'vite';
import react from '@vitejs/plugin-react';
// Mirrors the platform's inline configuration; no second frontend server/config.
await build({ configFile: false, plugins: [react()] });
