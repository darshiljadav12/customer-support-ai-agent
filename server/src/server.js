import { config } from './config/index.js';
import { connectDB, disconnectDB } from './config/db.js';
import { createApp } from './app.js';

async function main() {
  await connectDB();

  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`🚀 API listening on http://localhost:${config.port} (${config.env})`);
  });

  // Graceful shutdown (docker stop sends SIGTERM).
  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down...`);
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('❌ Failed to start server:', err.message);
  process.exit(1);
});
