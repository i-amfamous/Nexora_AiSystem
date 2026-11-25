import './core/env.js';
import { createApp } from './app.js';

const port = Number(process.env.PORT || 4000);
const host = process.env.HOST || '0.0.0.0';

const app = await createApp();

app.server.listen(port, host, () => {
  console.log(`[Nexora] API and web client listening on http://${host}:${port}`);
  console.log('[Nexora] Register a workspace from the sign-in screen to get started.');
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    console.log(`[Nexora] ${signal} received, shutting down`);
    await app.close();
    process.exit(0);
  });
}
