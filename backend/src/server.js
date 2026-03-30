import { app } from './app.js';
import { env } from './config/env.js';

const PORT = env.PORT || 4800;

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

server.on('error', (error) => {
  console.error('server_listen_error', error);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('uncaught_exception', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('unhandled_rejection', reason);
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.warn('received_sigterm');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.warn('received_sigint');
  server.close(() => process.exit(0));
});
