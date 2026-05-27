import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { NetworkType } from '@prisma/client';

const listQuerySchema = z.object({
  deviceId: z.string().optional(),
  groupId: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  active: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const exportQuerySchema = z.object({
  deviceId: z.string().optional(),
  groupId: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  active: z.coerce.boolean().optional(),
});

const summaryQuerySchema = z.object({
  deviceId: z.string().optional(),
  groupId: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  groupBy: z.enum(['device', 'group', 'day', 'week']).default('device'),
});

const vpnSessionsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /vpn-sessions
  fastify.get(
    '/',
    { preHandler: [fastify.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const orgId = req.orgId;
        if (!orgId) return reply.status(403).send({ error: 'Organization context required' });

        const parsed = listQuerySchema.safeParse(req.query);
        if (!parsed.success) {
          return reply.status(400).send({ error: 'Invalid query parameters', details: parsed.error.flatten() });
        }

        const { deviceId, groupId, from, to, active, page, limit } = parsed.data;

        // Build deviceId filter — if groupId provided, get all devices in that group
        let deviceIds: string[] | undefined;
        if (groupId) {
          const devicesInGroup = await fastify.prisma.device.findMany({
            where: { groupId, orgId },
            select: { id: true },
          });
          deviceIds = devicesInGroup.map((d) => d.id);
          if (deviceIds.length === 0) {
            return reply.send({ sessions: [], total: 0, page, limit });
          }
        }

        const where: Parameters<typeof fastify.prisma.vpnSession.findMany>[0]['where'] = {
          orgId,
          ...(deviceId && { deviceId }),
          ...(deviceIds && { deviceId: { in: deviceIds } }),
          ...(from || to
            ? {
                connectedAt: {
                  ...(from && { gte: new Date(from) }),
                  ...(to && { lte: new Date(to) }),
                },
              }
            : {}),
          ...(active === true && { disconnectedAt: null }),
          ...(active === false && { disconnectedAt: { not: null } }),
        };

        const skip = (page - 1) * limit;

        const [total, sessions] = await Promise.all([
          fastify.prisma.vpnSession.count({ where }),
          fastify.prisma.vpnSession.findMany({
            where,
            include: {
              device: { select: { id: true, name: true, os: true } },
            },
            orderBy: { connectedAt: 'desc' },
            skip,
            take: limit,
          }),
        ]);

        return reply.send({ sessions, total, page, limit });
      } catch (err) {
        fastify.log.error({ err }, 'List VPN sessions error');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // GET /vpn-sessions/summary
  fastify.get(
    '/summary',
    { preHandler: [fastify.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const orgId = req.orgId;
        if (!orgId) return reply.status(403).send({ error: 'Organization context required' });

        const parsed = summaryQuerySchema.safeParse(req.query);
        if (!parsed.success) {
          return reply.status(400).send({ error: 'Invalid query parameters', details: parsed.error.flatten() });
        }

        const { deviceId, groupId, from, to, groupBy } = parsed.data;

        let deviceIds: string[] | undefined;
        if (groupId) {
          const devicesInGroup = await fastify.prisma.device.findMany({
            where: { groupId, orgId },
            select: { id: true },
          });
          deviceIds = devicesInGroup.map((d) => d.id);
        }

        const where: Parameters<typeof fastify.prisma.vpnSession.findMany>[0]['where'] = {
          orgId,
          ...(deviceId && { deviceId }),
          ...(deviceIds && { deviceId: { in: deviceIds } }),
          ...(from || to
            ? {
                connectedAt: {
                  ...(from && { gte: new Date(from) }),
                  ...(to && { lte: new Date(to) }),
                },
              }
            : {}),
        };

        const sessions = await fastify.prisma.vpnSession.findMany({
          where,
          include: {
            device: {
              select: {
                id: true,
                name: true,
                group: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: { connectedAt: 'desc' },
        });

        // Aggregate based on groupBy
        if (groupBy === 'device') {
          const byDevice = new Map<
            string,
            { deviceId: string; deviceName: string; sessionCount: number; totalDurationSeconds: number }
          >();

          for (const session of sessions) {
            const key = session.deviceId;
            const existing = byDevice.get(key) ?? {
              deviceId: session.deviceId,
              deviceName: session.device.name,
              sessionCount: 0,
              totalDurationSeconds: 0,
            };
            existing.sessionCount += 1;
            existing.totalDurationSeconds += session.durationSeconds ?? 0;
            byDevice.set(key, existing);
          }

          return reply.send({ summary: Array.from(byDevice.values()), groupBy });
        }

        if (groupBy === 'group') {
          const byGroup = new Map<
            string,
            { groupId: string; groupName: string; sessionCount: number; totalDurationSeconds: number }
          >();

          for (const session of sessions) {
            const group = session.device.group;
            const key = group?.id ?? 'ungrouped';
            const existing = byGroup.get(key) ?? {
              groupId: key,
              groupName: group?.name ?? 'Ungrouped',
              sessionCount: 0,
              totalDurationSeconds: 0,
            };
            existing.sessionCount += 1;
            existing.totalDurationSeconds += session.durationSeconds ?? 0;
            byGroup.set(key, existing);
          }

          return reply.send({ summary: Array.from(byGroup.values()), groupBy });
        }

        // group by day or week
        const bucketMs = groupBy === 'day' ? 86400000 : 604800000;
        const byPeriod = new Map<
          string,
          { period: string; sessionCount: number; totalDurationSeconds: number }
        >();

        for (const session of sessions) {
          const ts = session.connectedAt.getTime();
          const bucketTs = Math.floor(ts / bucketMs) * bucketMs;
          const period = new Date(bucketTs).toISOString().slice(0, groupBy === 'day' ? 10 : 7);
          const existing = byPeriod.get(period) ?? {
            period,
            sessionCount: 0,
            totalDurationSeconds: 0,
          };
          existing.sessionCount += 1;
          existing.totalDurationSeconds += session.durationSeconds ?? 0;
          byPeriod.set(period, existing);
        }

        return reply.send({ summary: Array.from(byPeriod.values()).sort((a, b) => a.period.localeCompare(b.period)), groupBy });
      } catch (err) {
        fastify.log.error({ err }, 'VPN sessions summary error');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // GET /vpn-sessions/export
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

        const { deviceId, groupId, from, to, active } = parsed.data;

        let deviceIds: string[] | undefined;
        if (groupId) {
          const devicesInGroup = await fastify.prisma.device.findMany({
            where: { groupId, orgId },
            select: { id: true },
          });
          deviceIds = devicesInGroup.map((d) => d.id);
        }

        const where: Parameters<typeof fastify.prisma.vpnSession.findMany>[0]['where'] = {
          orgId,
          ...(deviceId && { deviceId }),
          ...(deviceIds && { deviceId: { in: deviceIds } }),
          ...(from || to
            ? {
                connectedAt: {
                  ...(from && { gte: new Date(from) }),
                  ...(to && { lte: new Date(to) }),
                },
              }
            : {}),
          ...(active === true && { disconnectedAt: null }),
          ...(active === false && { disconnectedAt: { not: null } }),
        };

        const sessions = await fastify.prisma.vpnSession.findMany({
          where,
          include: {
            device: { select: { id: true, name: true, os: true } },
          },
          orderBy: { connectedAt: 'desc' },
          take: 10000,
        });

        const headers = [
          'sessionId',
          'deviceId',
          'deviceName',
          'deviceOs',
          'vpnProfileName',
          'networkAtConnect',
          'ssidAtConnect',
          'connectedAt',
          'disconnectedAt',
          'durationSeconds',
          'terminatedBy',
        ];

        const rows = sessions.map((s) =>
          [
            s.id,
            s.deviceId,
            s.device.name,
            s.device.os,
            s.vpnProfileName ?? '',
            s.networkAtConnect ?? '',
            s.ssidAtConnect ?? '',
            s.connectedAt.toISOString(),
            s.disconnectedAt?.toISOString() ?? '',
            s.durationSeconds?.toString() ?? '',
            s.terminatedBy ?? '',
          ].join(',')
        );

        const csv = [headers.join(','), ...rows].join('\n');
        const filename = `vpn-sessions-${orgId}-${new Date().toISOString().slice(0, 10)}.csv`;

        return reply
          .header('Content-Type', 'text/csv')
          .header('Content-Disposition', `attachment; filename="${filename}"`)
          .send(csv);
      } catch (err) {
        fastify.log.error({ err }, 'Export VPN sessions error');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );
};

export default vpnSessionsRoutes;
