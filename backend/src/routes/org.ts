import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AdminRole } from '@prisma/client';
import bcrypt from 'bcrypt';
import { createAdminUser } from '../services/authService';
import { JwtPayload } from '../types';

const updateOrgSchema = z.object({
  name: z.string().min(1).max(100),
});

const inviteAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.nativeEnum(AdminRole),
});

const changeRoleSchema = z.object({
  role: z.nativeEnum(AdminRole),
});

function requireAdminOrHigher(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user as JwtPayload | undefined;
  if (!user || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) {
    return reply.status(403).send({ error: 'Admin access required' });
  }
}

const orgRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /org — get own org info
  fastify.get(
    '/',
    { preHandler: [fastify.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const orgId = req.orgId;
        if (!orgId) return reply.status(403).send({ error: 'Organization context required' });

        const org = await fastify.prisma.organization.findUnique({
          where: { id: orgId },
          include: {
            _count: {
              select: {
                devices: { where: { revoked: false } },
                groups: true,
                policies: true,
                admins: true,
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

  // PUT /org — update org name
  fastify.put(
    '/',
    { preHandler: [fastify.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        requireAdminOrHigher(req, reply);
        if (reply.sent) return;

        const orgId = req.orgId;
        if (!orgId) return reply.status(403).send({ error: 'Organization context required' });

        const parsed = updateOrgSchema.safeParse(req.body);
        if (!parsed.success) {
          return reply.status(400).send({ error: 'Invalid request body', details: parsed.error.flatten() });
        }

        const org = await fastify.prisma.organization.update({
          where: { id: orgId },
          data: { name: parsed.data.name },
        });

        return reply.send({ org });
      } catch (err) {
        fastify.log.error({ err }, 'Update org error');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // GET /org/admins
  fastify.get(
    '/admins',
    { preHandler: [fastify.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const orgId = req.orgId;
        if (!orgId) return reply.status(403).send({ error: 'Organization context required' });

        const admins = await fastify.prisma.adminUser.findMany({
          where: { orgId },
          select: {
            id: true,
            email: true,
            role: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        });

        return reply.send({ admins });
      } catch (err) {
        fastify.log.error({ err }, 'List admins error');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // POST /org/admins — invite admin
  fastify.post(
    '/admins',
    { preHandler: [fastify.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        requireAdminOrHigher(req, reply);
        if (reply.sent) return;

        const orgId = req.orgId;
        if (!orgId) return reply.status(403).send({ error: 'Organization context required' });

        const parsed = inviteAdminSchema.safeParse(req.body);
        if (!parsed.success) {
          return reply.status(400).send({ error: 'Invalid request body', details: parsed.error.flatten() });
        }

        // Non-super-admins cannot create SUPER_ADMIN accounts
        const user = req.user as JwtPayload;
        if (parsed.data.role === AdminRole.SUPER_ADMIN && user.role !== 'SUPER_ADMIN') {
          return reply.status(403).send({ error: 'Cannot create SUPER_ADMIN accounts' });
        }

        const admin = await createAdminUser(
          fastify.prisma,
          parsed.data.email,
          parsed.data.password,
          parsed.data.role,
          orgId
        );

        return reply.status(201).send({
          admin: {
            id: admin.id,
            email: admin.email,
            role: admin.role,
            orgId: admin.orgId,
            createdAt: admin.createdAt,
          },
        });
      } catch (err: unknown) {
        if (err instanceof Error && err.message.includes('Unique constraint')) {
          return reply.status(409).send({ error: 'Email already in use' });
        }
        fastify.log.error({ err }, 'Invite admin error');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // DELETE /org/admins/:id
  fastify.delete<{ Params: { id: string } }>(
    '/admins/:id',
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      try {
        requireAdminOrHigher(req, reply);
        if (reply.sent) return;

        const orgId = req.orgId;
        if (!orgId) return reply.status(403).send({ error: 'Organization context required' });

        const currentUser = req.user as JwtPayload;
        if (req.params.id === currentUser.userId) {
          return reply.status(400).send({ error: 'Cannot remove yourself' });
        }

        // Verify admin belongs to org
        const admin = await fastify.prisma.adminUser.findFirst({
          where: { id: req.params.id, orgId },
        });

        if (!admin) return reply.status(404).send({ error: 'Admin not found' });

        await fastify.prisma.adminUser.delete({ where: { id: req.params.id } });
        return reply.status(204).send();
      } catch (err) {
        fastify.log.error({ err }, 'Remove admin error');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // PUT /org/admins/:id/role
  fastify.put<{ Params: { id: string } }>(
    '/admins/:id/role',
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      try {
        requireAdminOrHigher(req, reply);
        if (reply.sent) return;

        const orgId = req.orgId;
        if (!orgId) return reply.status(403).send({ error: 'Organization context required' });

        const parsed = changeRoleSchema.safeParse(req.body);
        if (!parsed.success) {
          return reply.status(400).send({ error: 'Invalid request body', details: parsed.error.flatten() });
        }

        const currentUser = req.user as JwtPayload;
        // Non-super-admins cannot assign SUPER_ADMIN role
        if (parsed.data.role === AdminRole.SUPER_ADMIN && currentUser.role !== 'SUPER_ADMIN') {
          return reply.status(403).send({ error: 'Cannot assign SUPER_ADMIN role' });
        }

        // Verify admin belongs to org
        const admin = await fastify.prisma.adminUser.findFirst({
          where: { id: req.params.id, orgId },
        });

        if (!admin) return reply.status(404).send({ error: 'Admin not found' });

        const updated = await fastify.prisma.adminUser.update({
          where: { id: req.params.id },
          data: { role: parsed.data.role },
          select: { id: true, email: true, role: true, orgId: true, createdAt: true },
        });

        return reply.send({ admin: updated });
      } catch (err) {
        fastify.log.error({ err }, 'Change admin role error');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );
  // PATCH /org/admins/:id/password — reset another admin's password
  fastify.patch<{ Params: { id: string } }>(
    '/admins/:id/password',
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      try {
        requireAdminOrHigher(req, reply);
        if (reply.sent) return;

        const orgId = req.orgId;
        if (!orgId) return reply.status(403).send({ error: 'Organization context required' });

        const parsed = z.object({ newPassword: z.string().min(8) }).safeParse(req.body);
        if (!parsed.success) {
          return reply.status(400).send({ error: 'Invalid body', details: parsed.error.flatten() });
        }

        const currentUser = req.user as JwtPayload;
        if (req.params.id === currentUser.userId) {
          return reply.status(400).send({ error: 'Use account settings to change your own password' });
        }

        const admin = await fastify.prisma.adminUser.findFirst({
          where: { id: req.params.id, orgId },
        });
        if (!admin) return reply.status(404).send({ error: 'Admin not found' });

        const hash = await bcrypt.hash(parsed.data.newPassword, 12);
        await fastify.prisma.adminUser.update({
          where: { id: req.params.id },
          data: { passwordHash: hash },
        });

        return reply.status(204).send();
      } catch (err) {
        fastify.log.error({ err }, 'Reset admin password error');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );
};

export default orgRoutes;
