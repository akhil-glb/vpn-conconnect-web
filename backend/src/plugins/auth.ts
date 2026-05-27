import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import crypto from 'crypto';
import { config } from '../config';
import { JwtPayload, DeviceTokenPayload } from '../types';

const authPlugin: FastifyPluginAsync = async (fastify) => {
  // Register JWT plugin
  await fastify.register(fastifyJwt, {
    secret: config.jwtSecret,
    sign: {
      expiresIn: config.jwtExpiry,
    },
  });

  // Authenticate admin via JWT Bearer token
  fastify.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.status(401).send({ error: 'Missing or invalid Authorization header' });
      }

      const token = authHeader.slice(7);
      const decoded = fastify.jwt.verify<JwtPayload>(token);

      if (decoded.type !== 'admin') {
        return reply.status(401).send({ error: 'Invalid token type' });
      }

      req.user = decoded;
      req.orgId = decoded.orgId ?? undefined;
      req.role = decoded.role;
    } catch (err) {
      return reply.status(401).send({ error: 'Invalid or expired token' });
    }
  });

  // Authenticate device via raw device token (HMAC-SHA256 lookup)
  fastify.decorate('authenticateDevice', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.status(401).send({ error: 'Missing or invalid Authorization header' });
      }

      const rawToken = authHeader.slice(7);

      // Hash token using HMAC-SHA256 with device token secret
      const tokenHash = crypto
        .createHmac('sha256', config.deviceTokenSecret)
        .update(rawToken)
        .digest('hex');

      // Look up device by tokenHash
      const device = await fastify.prisma.device.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          orgId: true,
          revoked: true,
          name: true,
        },
      });

      if (!device) {
        return reply.status(401).send({ error: 'Invalid device token' });
      }

      if (device.revoked) {
        return reply.status(403).send({ error: 'Device has been revoked' });
      }

      const payload: DeviceTokenPayload = {
        deviceId: device.id,
        orgId: device.orgId,
        type: 'device',
      };

      req.user = payload;
      req.orgId = device.orgId;
    } catch (err) {
      fastify.log.error({ err }, 'Device authentication error');
      return reply.status(401).send({ error: 'Authentication failed' });
    }
  });
};

export default fp(authPlugin);
