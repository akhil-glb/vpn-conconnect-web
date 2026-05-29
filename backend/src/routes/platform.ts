import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { PlanType, AuditEvent } from '@prisma/client';
import { createAdminUser, impersonateOrg } from '../services/authService';
import { log } from '../services/auditService';
import { JwtPayload } from '../types';

const createOrgSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  plan: z.nativeEnum(PlanType).optional(),
});

const updateOrgSchema = z.object({
  plan: z.nativeEnum(PlanType).optional(),
  maxDevices: z.number().int().min(1).optional(),
  name: z.string().min(1).max(100).optional(),
});

// Middleware to ensure SUPER_ADMIN only
async function requireSuperAdmin(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user as JwtPayload | undefined;
  if (!user || user.role !== 'SUPER_ADMIN') {
    return reply.status(403).send({ error: 'Super admin access required' });
  }
}

const platformRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /platform/orgs
  fastify.get(
    '/orgs',
    { preHandler: [fastify.authenticate, requireSuperAdmin] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const orgs = await fastify.prisma.organization.findMany({
          include: {
            _count: {
              select: {
                devices: { where: { revoked: false } },
                admins: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        });

        return reply.send({ orgs });
      } catch (err) {
        fastify.log.error({ err }, 'List orgs error');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // POST /platform/orgs
  fastify.post(
    '/orgs',
    { preHandler: [fastify.authenticate, requireSuperAdmin] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = req.user as JwtPayload;
        const parsed = createOrgSchema.safeParse(req.body);
        if (!parsed.success) {
          return reply.status(400).send({ error: 'Invalid request body', details: parsed.error.flatten() });
        }

        const org = await fastify.prisma.organization.create({
          data: {
            name: parsed.data.name,
            slug: parsed.data.slug,
            plan: parsed.data.plan ?? PlanType.FREE,
          },
        });

        await log(fastify.prisma, {
          orgId: org.id,
          adminId: user.userId,
          event: AuditEvent.ORG_CREATED,
          detail: { name: org.name, slug: org.slug, plan: org.plan },
        });

        return reply.status(201).send({ org });
      } catch (err: unknown) {
        if (err instanceof Error && err.message.includes('Unique constraint')) {
          return reply.status(409).send({ error: 'Organization slug already exists' });
        }
        fastify.log.error({ err }, 'Create org error');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // GET /platform/orgs/:id
  fastify.get<{ Params: { id: string } }>(
    '/orgs/:id',
    { preHandler: [fastify.authenticate, requireSuperAdmin] },
    async (req, reply) => {
      try {
        const org = await fastify.prisma.organization.findUnique({
          where: { id: req.params.id },
          include: {
            admins: { select: { id: true, email: true, role: true, createdAt: true } },
            _count: {
              select: {
                devices: { where: { revoked: false } },
                groups: true,
                policies: true,
              },
            },
          },
        });

        if (!org) return reply.status(404).send({ error: 'Organization not found' });
        return reply.send({ org });
      } catch (err) {
        fastify.log.error({ err }, 'Get org error');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // PATCH /platform/orgs/:id
  fastify.patch<{ Params: { id: string } }>(
    '/orgs/:id',
    { preHandler: [fastify.authenticate, requireSuperAdmin] },
    async (req, reply) => {
      try {
        const user = req.user as JwtPayload;
        const parsed = updateOrgSchema.safeParse(req.body);
        if (!parsed.success) {
          return reply.status(400).send({ error: 'Invalid request body', details: parsed.error.flatten() });
        }

        const org = await fastify.prisma.organization.findUnique({
          where: { id: req.params.id },
        });
        if (!org) return reply.status(404).send({ error: 'Organization not found' });

        const updated = await fastify.prisma.organization.update({
          where: { id: req.params.id },
          data: {
            ...(parsed.data.plan !== undefined && { plan: parsed.data.plan }),
            ...(parsed.data.maxDevices !== undefined && { maxDevices: parsed.data.maxDevices }),
            ...(parsed.data.name !== undefined && { name: parsed.data.name }),
          },
        });

        if (parsed.data.plan && parsed.data.plan !== org.plan) {
          await log(fastify.prisma, {
            orgId: req.params.id,
            adminId: user.userId,
            event: AuditEvent.PLAN_CHANGED,
            detail: { from: org.plan, to: parsed.data.plan },
          });
        }

        return reply.send({ org: updated });
      } catch (err) {
        fastify.log.error({ err }, 'Update org error');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // DELETE /platform/orgs/:id/suspend
  fastify.delete<{ Params: { id: string } }>(
    '/orgs/:id/suspend',
    { preHandler: [fastify.authenticate, requireSuperAdmin] },
    async (req, reply) => {
      try {
        const user = req.user as JwtPayload;
        const org = await fastify.prisma.organization.findUnique({
          where: { id: req.params.id },
        });
        if (!org) return reply.status(404).send({ error: 'Organization not found' });

        const updated = await fastify.prisma.organization.update({
          where: { id: req.params.id },
          data: { suspendedAt: new Date() },
        });

        await log(fastify.prisma, {
          orgId: req.params.id,
          adminId: user.userId,
          event: AuditEvent.ORG_SUSPENDED,
          detail: { suspendedAt: updated.suspendedAt },
        });

        return reply.send({ org: updated });
      } catch (err) {
        fastify.log.error({ err }, 'Suspend org error');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // POST /platform/orgs/:id/impersonate
  fastify.post<{ Params: { id: string } }>(
    '/orgs/:id/impersonate',
    { preHandler: [fastify.authenticate, requireSuperAdmin] },
    async (req, reply) => {
      try {
        const user = req.user as JwtPayload;
        const token = await impersonateOrg(fastify, req.params.id, user.userId);

        return reply.send({ token });
      } catch (err: unknown) {
        if (err instanceof Error && err.message === 'Organization not found') {
          return reply.status(404).send({ error: 'Organization not found' });
        }
        fastify.log.error({ err }, 'Impersonate org error');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // GET /platform/stats
  fastify.get(
    '/stats',
    { preHandler: [fastify.authenticate, requireSuperAdmin] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const [totalOrgs, totalDevices, totalAdmins] = await Promise.all([
          fastify.prisma.organization.count(),
          fastify.prisma.device.count({ where: { revoked: false } }),
          fastify.prisma.adminUser.count(),
        ]);

        // Count online devices by checking Redis keys
        // Use SCAN to count device:status:* keys
        let onlineDevices = 0;
        let cursor = '0';
        do {
          const [nextCursor, keys] = await fastify.redis.scan(
            cursor,
            'MATCH',
            'device:status:*',
            'COUNT',
            '100'
          );
          cursor = nextCursor;
          onlineDevices += keys.length;
        } while (cursor !== '0');

        return reply.send({
          totalOrgs,
          totalDevices,
          onlineDevices,
          totalAdmins,
        });
      } catch (err) {
        fastify.log.error({ err }, 'Get platform stats error');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );
};

export default platformRoutes;
