import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import { config } from './config.js';
import { getDb } from './db/db.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerNowRoutes } from './routes/now.js';
import { registerChatRoutes } from './routes/chat.js';
import { registerPlayerRoutes } from './routes/player.js';
import { registerStreamRoutes } from './routes/stream.js';
import { registerSearchRoutes } from './routes/search.js';
import { registerPlaylistRoutes } from './routes/playlist.js';
import { registerProfileRoutes } from './routes/profile.js';
import { registerSettingsRoutes } from './routes/settings.js';
import { registerLyricRoutes } from './routes/lyric.js';
import { registerWebSocket, getClientCount } from './ws.js';
import { startScheduler, stopScheduler, setBroadcast } from './services/scheduler.service.js';
import { broadcast } from './ws.js';
import { queueRepo } from './db/queue.repo.js';
import { getActiveStreamCount } from './routes/stream.js';
import { installProcessHandlers, setMetricGetters, startPeriodicLogs, stopPeriodicLogs, logHealthReport } from './observability.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Observability: must be installed before anything else ──
installProcessHandlers();
setMetricGetters({
  getWsClients: () => getClientCount(),
  getQueueSize: async () => queueRepo.size(),
  getActiveStreams: () => getActiveStreamCount(),
});
startPeriodicLogs();

// Initialize DB before starting server
await getDb();

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(fastifyWebsocket);

await app.register(fastifyStatic, {
  root: path.join(__dirname, '..', '..', '..', 'cache'),
  prefix: '/cache/',
  decorateReply: true,
});

registerWebSocket(app);
registerHealthRoutes(app);
registerNowRoutes(app);
registerChatRoutes(app);
registerPlayerRoutes(app);
registerStreamRoutes(app);
registerSearchRoutes(app);
registerPlaylistRoutes(app);
registerProfileRoutes(app);
registerSettingsRoutes(app);
registerLyricRoutes(app);

setBroadcast(broadcast);
startScheduler();

const gracefulShutdown = async (signal: string) => {
  console.log(`\n[Server] ${signal} received, shutting down...`);
  stopScheduler();
  stopPeriodicLogs();
  await logHealthReport();
  await app.close();
  process.exit(0);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

try {
  await app.listen({ port: config.PORT, host: config.HOST });
  console.log(`\n🎧 Claudio FM backend ready → http://localhost:${config.PORT}\n`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
