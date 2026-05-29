import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { verifyAdminPassword, generateAdminToken } from '../services/authService';
import { log } from '../services/auditService';
import { AuditEvent } from '@prisma/client';
import { JwtPayload } from '../types';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /auth/login
  fastify.post(
    '/login',
    {
      config: { public: true },
    },
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const parsed = loginSchema.safeParse(req.body);
        if (!parsed.success) {
          return reply.status(400).send({ error: 'Invalid request body', details: parsed.error.flatten() });
        }

        const { email, password } = parsed.data;

        const admin = await verifyAdminPassword(fastify.prisma, email, password);
        if (!admin) {
          return reply.status(401).send({ error: 'Invalid email or password' });
        }

        // Check org slug header if provided (for non-super-admin context)
        const orgSlug = req.headers['x-org-slug'] as string | undefined;
        let resolvedOrgId = admin.orgId;

        if (orgSlug && admin.role !== 'SUPER_ADMIN') {
          const org = await fastify.prisma.organization.findUnique({
            where: { slug: orgSlug },
          });

          if (!org) {
            return reply.status(404).send({ error: 'Organization not found' });
          }

          // Verify the admin belongs to this org
          if (admin.orgId && admin.orgId !== org.id) {
            return reply.status(403).send({ error: 'Forbidden: admin does not belong to this org' });
          }

          resolvedOrgId = org.id;
        }

        const token = await generateAdminToken(fastify, admin.id, admin.role, resolvedOrgId ?? null);

        if (resolvedOrgId) {
          await log(fastify.prisma, {
            orgId: resolvedOrgId,
            adminId: admin.id,
            event: AuditEvent.ADMIN_LOGIN,
            detail: { email: admin.email },
          });
        }

        return reply.send({
          token,
          user: {
            id: admin.id,
            email: admin.email,
            role: admin.role,
            orgId: resolvedOrgId ?? null,
          },
        });
      } catch (err) {
        fastify.log.error({ err }, 'Login error');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // POST /auth/logout
  fastify.post(
    '/logout',
    {
      preHandler: [fastify.authenticate],
    },
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = req.user as JwtPayload;
        if (user.orgId) {
          await log(fastify.prisma, {
            orgId: user.orgId,
            adminId: user.userId,
            event: AuditEvent.ADMIN_LOGOUT,
            detail: {},
          });
        }

        return reply.status(204).send();
      } catch (err) {
        fastify.log.error({ err }, 'Logout error');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // POST /auth/refresh
  fastify.post(
    '/refresh',
    {
      preHandler: [fastify.authenticate],
    },
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = req.user as JwtPayload;
        const token = await generateAdminToken(fastify, user.userId, user.role, user.orgId);

        return reply.send({ token });
      } catch (err) {
        fastify.log.error({ err }, 'Refresh error');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );
};

export default authRoutes;
