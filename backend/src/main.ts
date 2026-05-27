import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import multipart from '@fastify/multipart';
import Redis from 'ioredis';
import { config } from './config';
import prismaPlugin from './plugins/database';
import redisPlugin from './plugins/redis';
import authPlugin from './plugins/auth';
import tenantPlugin from './plugins/tenantMiddleware';
import { handleDeviceOffline } from './services/statusService';

// Route imports
import authRoutes from './routes/auth';
import devicesRoutes from './routes/devices';
import configRoutes from './routes/config';
import statusRoutes from './routes/status';
import policiesRoutes from './routes/policies';
import groupsRoutes from './routes/groups';
import auditRoutes from './routes/audit';
import vpnSessionsRoutes from './routes/vpnSessions';
import updatesRoutes from './routes/updates';
import platformRoutes from './routes/platform';
import orgRoutes from './routes/org';
import dashboardWsRoute from './routes/ws/dashboard';

async function buildServer() {
  const fastify = Fastify({
    logger: {
      level: config.nodeEnv === 'production' ? 'info' : 'debug',
      ...(config.nodeEnv !== 'production' && {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true },
        },
      }),
    },
    trustProxy: true,
  });

  // Register CORS
  await fastify.register(cors, {
    origin: config.corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Org-Slug'],
  });

  // Register rate limiting
  await fastify.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
  });

  // Register WebSocket support
  await fastify.register(websocket);

  // Register multipart support
  await fastify.register(multipart);

  // Register core plugins
  await fastify.register(prismaPlugin);
  await fastify.register(redisPlugin);
  await fastify.register(authPlugin);
  await fastify.register(tenantPlugin);

  // Register API routes with /api/v1 prefix
  await fastify.register(
    async (api) => {
      // Auth routes with stricter rate limiting
      await api.register(
        async (authScope) => {
          await authScope.register(rateLimit, {
            max: 5,
            timeWindow: '1 minute',
            keyGenerator: (req) => req.ip,
            errorResponseBuilder: () => ({
              statusCode: 429,
              error: 'Too Many Requests',
              message: 'Too many login attempts, please try again later',
            }),
          });
          await authScope.register(authRoutes);
        },
        { prefix: '/auth' }
      );

      await api.register(devicesRoutes, { prefix: '/devices' });
      await api.register(configRoutes, { prefix: '/config' });
      await api.register(statusRoutes, { prefix: '/status' });
      await api.register(policiesRoutes, { prefix: '/policies' });
      await api.register(groupsRoutes, { prefix: '/groups' });
      await api.register(auditRoutes, { prefix: '/audit-logs' });
      await api.register(vpnSessionsRoutes, { prefix: '/vpn-sessions' });
      await api.register(updatesRoutes, { prefix: '/updates' });
      await api.register(platformRoutes, { prefix: '/platform' });
      await api.register(orgRoutes, { prefix: '/org' });
    },
    { prefix: '/api/v1' }
  );

  // Register WebSocket dashboard route (no prefix — registered at root level)
  await fastify.register(dashboardWsRoute);

  // Health check endpoint
  fastify.get('/health', { config: { public: true } }, async (_req, reply) => {
    return reply.send({ status: 'ok', timestamp: new Date().toISOString() });
  });

  return fastify;
}

async function setupOfflineDetection(fastify: Awaited<ReturnType<typeof buildServer>>) {
  // Subscribe to Redis keyspace expiry events for device offline detection
  // Uses a separate Redis connection to avoid blocking the main connection
  const keyspaceSubscriber = new Redis(config.redisUrl);

  keyspaceSubscriber.on('error', (err) => {
    fastify.log.error({ err }, 'Keyspace subscriber Redis error');
  });

  // Subscribe to expired key events on database 0
  await keyspaceSubscriber.subscribe('__keyevent@0__:expired');

  keyspaceSubscriber.on('message', async (_channel: string, key: string) => {
    // Pattern: device:status:<deviceId>
    if (!key.startsWith('device:status:')) return;

    const deviceId = key.replace('device:status:', '');
    if (!deviceId) return;

    try {
      // Look up device to get orgId
      const device = await fastify.prisma.device.findUnique({
        where: { id: deviceId },
        select: { id: true, orgId: true, revoked: true },
      });

      if (!device || device.revoked) return;

      fastify.log.info({ deviceId, orgId: device.orgId }, 'Device went offline (TTL expired)');

      await handleDeviceOffline(deviceId, device.orgId, fastify.prisma, fastify.redis);
    } catch (err) {
      fastify.log.error({ err, deviceId }, 'Error handling device offline event');
    }
  });

  // Clean up on server close
  fastify.addHook('onClose', async () => {
    try {
      await keyspaceSubscriber.unsubscribe('__keyevent@0__:expired');
      keyspaceSubscriber.disconnect();
    } catch {
      // ignore cleanup errors
    }
  });
}

async function start() {
  let fastify: Awaited<ReturnType<typeof buildServer>> | undefined;

  try {
    fastify = await buildServer();

    // Set up offline detection BEFORE listen() so addHook('onClose') is still allowed.
    // Decorators (fastify.prisma, fastify.redis) are available lazily after listen() loads them;
    // keyspace messages only arrive after devices connect, so the timing is safe.
    await setupOfflineDetection(fastify);

    await fastify.listen({ port: config.port, host: config.host });

    fastify.log.info(`Server listening on ${config.host}:${config.port}`);
    fastify.log.info(`Environment: ${config.nodeEnv}`);
  } catch (err) {
    if (fastify) {
      fastify.log.error(err, 'Server startup failed');
    } else {
      console.error('Server startup failed:', err);
    }
    process.exit(1);
  }

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];
  for (const signal of signals) {
    process.on(signal, async () => {
      if (fastify) {
        fastify.log.info(`Received ${signal}, shutting down gracefully`);
        try {
          await fastify.close();
          fastify.log.info('Server closed');
        } catch (err) {
          fastify.log.error(err, 'Error during shutdown');
        }
      }
      process.exit(0);
    });
  }
}

start().catch((err) => {
  console.error('Unhandled error during startup:', err);
  process.exit(1);
});
