import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import Redis from 'ioredis';
import { config } from '../config';

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
  }
}

const redisPlugin: FastifyPluginAsync = async (fastify) => {
  const redis = new Redis(config.redisUrl, {
    maxRetriesPerRequest: 3,
    lazyConnect: false,
  });

  redis.on('error', (err) => {
    fastify.log.error({ err }, 'Redis connection error');
  });

  redis.on('connect', () => {
    fastify.log.info('Redis connected');
  });

  // Enable keyspace notifications for expired keys (for offline detection)
  try {
    await redis.config('SET', 'notify-keyspace-events', 'KEx');
    fastify.log.info('Redis keyspace notifications enabled');
  } catch (err) {
    fastify.log.warn({ err }, 'Could not set Redis keyspace notifications (may require Redis config permissions)');
  }

  fastify.decorate('redis', redis);

  fastify.addHook('onClose', async () => {
    await redis.quit();
  });
};

export default fp(redisPlugin);
