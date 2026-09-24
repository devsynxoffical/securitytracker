import app from './app.js';
import { config } from './config/env.js';
import { disconnectPrisma } from './lib/prisma.js';

const server = app.listen(config.PORT, () => {
  console.log(`[DEVSYNX Backend] Running on http://localhost:${config.PORT} (env: ${config.NODE_ENV})`);
});

async function shutdown(signal: string) {
  console.log(`[DEVSYNX Backend] Received ${signal}. Initiating graceful shutdown...`);

  server.close(async () => {
    console.log('[DEVSYNX Backend] HTTP server closed.');
    try {
      await disconnectPrisma();
      console.log('[DEVSYNX Backend] Database connection closed.');
      process.exit(0);
    } catch (err) {
      console.error('[DEVSYNX Backend] Error during database disconnect:', err);
      process.exit(1);
    }
  });

  // Force exit if graceful shutdown takes longer than 10 seconds
  setTimeout(() => {
    console.error('[DEVSYNX Backend] Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
