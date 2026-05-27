import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  listDevices,
  getDevice,
  revokeDevice,
  getDeviceStatusHistory,
  getDeviceVpnSessions,
  generateEnrollmentToken,
  assignDeviceToGroup,
} from '../services/deviceService';
import { listAuditLogs } from '../services/auditService';
import { setDeviceOverride } from '../services/statusService';
import { JwtPayload } from '../types';
import { AuditEvent } from '@prisma/client';

const overrideSchema = z.object({
  allow: z.boolean(),
  durationMinutes: z.number().int().min(1).max(1440),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const devicesRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /devices — list all devices with live status
  fastify.get(
    '/',
    { preHandler: [fastify.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const orgId = req.orgId;
        if (!orgId) return reply.status(403).send({ error: 'Organization context required' });

        const devices = await listDevices(fastify.prisma, fastify.redis, orgId);
        return reply.send({ devices });
      } catch (err) {
        fastify.log.error({ err }, 'List devices error');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // GET /devices/:id — device detail
  fastify.get(
    '/:id',
    { preHandler: [fastify.authenticate] },
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const orgId = req.orgId;
        if (!orgId) return reply.status(403).send({ error: 'Organization context required' });

        const device = await getDevice(fastify.prisma, fastify.redis, req.params.id, orgId);
        if (!device) return reply.status(404).send({ error: 'Device not found' });

        return reply.send({ device });
      } catch (err) {
        fastify.log.error({ err }, 'Get device error');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // DELETE /devices/:id — revoke device
  fastify.delete(
    '/:id',
    { preHandler: [fastify.authenticate] },
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const user = req.user as JwtPayload;
        if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
          return reply.status(403).send({ error: 'Insufficient permissions' });
        }

        const orgId = req.orgId;
        if (!orgId) return reply.status(403).send({ error: 'Organization context required' });

        await revokeDevice(fastify.prisma, fastify.redis, req.params.id, orgId, user.userId);
        return reply.status(204).send();
      } catch (err: unknown) {
        if (err instanceof Error && err.message === 'Device not found') {
          return reply.status(404).send({ error: 'Device not found' });
        }
        fastify.log.error({ err }, 'Revoke device error');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // GET /devices/:id/status-history
  fastify.get(
    '/:id/status-history',
    { preHandler: [fastify.authenticate] },
    async (req: FastifyRequest<{ Params: { id: string }; Querystring: Record<string, string> }>, reply: FastifyReply) => {
      try {
        const orgId = req.orgId;
        if (!orgId) return reply.status(403).send({ error: 'Organization context required' });

        const { page, limit } = paginationSchema.parse(req.query);
        const result = await getDeviceStatusHistory(
          fastify.prisma,
          req.params.id,
          orgId,
          page,
          limit
        );

        if (!result) return reply.status(404).send({ error: 'Device not found' });
        return reply.send(result);
      } catch (err) {
        fastify.log.error({ err }, 'Status history error');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // GET /devices/:id/audit-logs
  fastify.get(
    '/:id/audit-logs',
    { preHandler: [fastify.authenticate] },
    async (req: FastifyRequest<{ Params: { id: string }; Querystring: Record<string, string> }>, reply: FastifyReply) => {
      try {
        const orgId = req.orgId;
        if (!orgId) return reply.status(403).send({ error: 'Organization context required' });

        const { page, limit } = paginationSchema.parse(req.query);
        const result = await listAuditLogs(fastify.prisma, orgId, {
          deviceId: req.params.id,
          page,
          limit,
        });

        return reply.send(result);
      } catch (err) {
        fastify.log.error({ err }, 'Device audit logs error');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // GET /devices/:id/vpn-sessions
  fastify.get(
    '/:id/vpn-sessions',
    { preHandler: [fastify.authenticate] },
    async (req: FastifyRequest<{ Params: { id: string }; Querystring: Record<string, string> }>, reply: FastifyReply) => {
      try {
        const orgId = req.orgId;
        if (!orgId) return reply.status(403).send({ error: 'Organization context required' });

        const { page, limit } = paginationSchema.parse(req.query);
        const result = await getDeviceVpnSessions(
          fastify.prisma,
          req.params.id,
          orgId,
          page,
          limit
        );

        if (!result) return reply.status(404).send({ error: 'Device not found' });
        return reply.send(result);
      } catch (err) {
        fastify.log.error({ err }, 'Device VPN sessions error');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // POST /devices/:id/override
  fastify.post(
    '/:id/override',
    { preHandler: [fastify.authenticate] },
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const user = req.user as JwtPayload;
        const orgId = req.orgId;
        if (!orgId) return reply.status(403).send({ error: 'Organization context required' });

        const parsed = overrideSchema.safeParse(req.body);
        if (!parsed.success) {
          return reply.status(400).send({ error: 'Invalid request body', details: parsed.error.flatten() });
        }

        // Verify device belongs to org
        const device = await fastify.prisma.device.findFirst({
          where: { id: req.params.id, orgId },
        });
        if (!device) return reply.status(404).send({ error: 'Device not found' });

        const override = await setDeviceOverride(
          fastify.redis,
          req.params.id,
          parsed.data.allow,
          parsed.data.durationMinutes
        );

        // Write audit log
        const { log } = await import('../services/auditService');
        await log(fastify.prisma, {
          orgId,
          deviceId: req.params.id,
          adminId: user.userId,
          event: AuditEvent.MANUAL_OVERRIDE,
          detail: { allow: parsed.data.allow, durationMinutes: parsed.data.durationMinutes },
        });

        return reply.send({ override });
      } catch (err) {
        fastify.log.error({ err }, 'Override error');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // POST /devices/enrollment-token
  fastify.post(
    '/enrollment-token',
    { preHandler: [fastify.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = req.user as JwtPayload;
        if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
          return reply.status(403).send({ error: 'Insufficient permissions' });
        }

        const orgId = req.orgId;
        if (!orgId) return reply.status(403).send({ error: 'Organization context required' });

        const token = await generateEnrollmentToken(fastify.redis, user.userId, orgId);
        return reply.send({ token });
      } catch (err) {
        fastify.log.error({ err }, 'Enrollment token error');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );
};

export default devicesRoutes;
