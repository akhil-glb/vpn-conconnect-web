import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AuditEvent } from '@prisma/client';
import { listAuditLogs, exportCsv } from '../services/auditService';

const auditQuerySchema = z.object({
  deviceId: z.string().optional(),
  event: z.nativeEnum(AuditEvent).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const exportQuerySchema = z.object({
  format: z.enum(['csv']).default('csv'),
  deviceId: z.string().optional(),
  event: z.nativeEnum(AuditEvent).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

const auditRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /audit-logs
  fastify.get(
    '/',
    { preHandler: [fastify.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const orgId = req.orgId;
        if (!orgId) return reply.status(403).send({ error: 'Organization context required' });

        const parsed = auditQuerySchema.safeParse(req.query);
        if (!parsed.success) {
          return reply.status(400).send({ error: 'Invalid query parameters', details: parsed.error.flatten() });
        }

        const { deviceId, event, from, to, page, limit } = parsed.data;

        const result = await listAuditLogs(fastify.prisma, orgId, {
          deviceId,
          event,
          from: from ? new Date(from) : undefined,
          to: to ? new Date(to) : undefined,
          page,
          limit,
        });

        return reply.send(result);
      } catch (err) {
        fastify.log.error({ err }, 'List audit logs error');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // GET /audit-logs/export
  fastify.get(
    '/export',
    { preHandler: [fastify.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const orgId = req.orgId;
        if (!orgId) return reply.status(403).send({ error: 'Organization context required' });

        const parsed = exportQuerySchema.safeParse(req.query);
        if (!parsed.success) {
          return reply.status(400).send({ error: 'Invalid query parameters', details: parsed.error.flatten() });
        }

        const { deviceId, event, from, to } = parsed.data;

        const csv = await exportCsv(fastify.prisma, orgId, {
          deviceId,
          event,
          from: from ? new Date(from) : undefined,
          to: to ? new Date(to) : undefined,
        });

        const filename = `audit-logs-${orgId}-${new Date().toISOString().slice(0, 10)}.csv`;

        return reply
          .header('Content-Type', 'text/csv')
          .header('Content-Disposition', `attachment; filename="${filename}"`)
          .send(csv);
      } catch (err) {
        fastify.log.error({ err }, 'Export audit logs error');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );
};

export default auditRoutes;
