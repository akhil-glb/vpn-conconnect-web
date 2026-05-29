import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { JwtPayload } from '../types';
import { assignDeviceToGroup } from '../services/deviceService';

const createGroupSchema = z.object({
  name: z.string().min(1).max(100),
  policyId: z.string().min(1),
});

const updateGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  policyId: z.string().min(1).optional(),
});

const assignDevicesSchema = z.object({
  deviceIds: z.array(z.string().min(1)).min(1),
});

const groupsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /groups
  fastify.get(
    '/',
    { preHandler: [fastify.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const orgId = req.orgId;
        if (!orgId) return reply.status(403).send({ error: 'Organization context required' });

        const groups = await fastify.prisma.group.findMany({
          where: { orgId },
          include: {
            policy: { select: { id: true, name: true } },
            _count: { select: { devices: true } },
          },
          orderBy: { createdAt: 'asc' },
        });

        return reply.send({ groups });
      } catch (err) {
        fastify.log.error({ err }, 'List groups error');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // POST /groups
  fastify.post(
    '/',
    { preHandler: [fastify.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = req.user as JwtPayload;
        if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
          return reply.status(403).send({ error: 'Insufficient permissions' });
        }

        const orgId = req.orgId;
        if (!orgId) return reply.status(403).send({ error: 'Organization context required' });

        const parsed = createGroupSchema.safeParse(req.body);
        if (!parsed.success) {
          return reply.status(400).send({ error: 'Invalid request body', details: parsed.error.flatten() });
        }

        // Verify policy belongs to org
        const policy = await fastify.prisma.policy.findFirst({
          where: { id: parsed.data.policyId, orgId },
        });
        if (!policy) return reply.status(404).send({ error: 'Policy not found' });

        const group = await fastify.prisma.group.create({
          data: {
            orgId,
            name: parsed.data.name,
            policyId: parsed.data.policyId,
          },
          include: { policy: { select: { id: true, name: true } } },
        });

        return reply.status(201).send({ group });
      } catch (err) {
        fastify.log.error({ err }, 'Create group error');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // PUT /groups/:id
  fastify.put<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      try {
        const user = req.user as JwtPayload;
        if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
          return reply.status(403).send({ error: 'Insufficient permissions' });
        }

        const orgId = req.orgId;
        if (!orgId) return reply.status(403).send({ error: 'Organization context required' });

        const parsed = updateGroupSchema.safeParse(req.body);
        if (!parsed.success) {
          return reply.status(400).send({ error: 'Invalid request body', details: parsed.error.flatten() });
        }

        // Verify group belongs to org
        const existing = await fastify.prisma.group.findFirst({
          where: { id: req.params.id, orgId },
        });
        if (!existing) return reply.status(404).send({ error: 'Group not found' });

        // If changing policy, verify it belongs to org
        if (parsed.data.policyId) {
          const policy = await fastify.prisma.policy.findFirst({
            where: { id: parsed.data.policyId, orgId },
          });
          if (!policy) return reply.status(404).send({ error: 'Policy not found' });
        }

        const group = await fastify.prisma.group.update({
          where: { id: req.params.id },
          data: {
            ...(parsed.data.name !== undefined && { name: parsed.data.name }),
            ...(parsed.data.policyId !== undefined && { policyId: parsed.data.policyId }),
          },
          include: { policy: { select: { id: true, name: true } } },
        });

        return reply.send({ group });
      } catch (err) {
        fastify.log.error({ err }, 'Update group error');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // DELETE /groups/:id
  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      try {
        const user = req.user as JwtPayload;
        if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
          return reply.status(403).send({ error: 'Insufficient permissions' });
        }

        const orgId = req.orgId;
        if (!orgId) return reply.status(403).send({ error: 'Organization context required' });

        const group = await fastify.prisma.group.findFirst({
          where: { id: req.params.id, orgId },
          include: { _count: { select: { devices: true } } },
        });

        if (!group) return reply.status(404).send({ error: 'Group not found' });

        if (group._count.devices > 0) {
          return reply.status(409).send({
            error: `Cannot delete group: ${group._count.devices} device(s) still assigned to this group`,
          });
        }

        await fastify.prisma.group.delete({ where: { id: req.params.id } });
        return reply.status(204).send();
      } catch (err) {
        fastify.log.error({ err }, 'Delete group error');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // POST /groups/:id/devices — assign devices to group
  fastify.post<{ Params: { id: string } }>(
    '/:id/devices',
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      try {
        const user = req.user as JwtPayload;
        if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
          return reply.status(403).send({ error: 'Insufficient permissions' });
        }

        const orgId = req.orgId;
        if (!orgId) return reply.status(403).send({ error: 'Organization context required' });

        const parsed = assignDevicesSchema.safeParse(req.body);
        if (!parsed.success) {
          return reply.status(400).send({ error: 'Invalid request body', details: parsed.error.flatten() });
        }

        // Verify group belongs to org
        const group = await fastify.prisma.group.findFirst({
          where: { id: req.params.id, orgId },
        });
        if (!group) return reply.status(404).send({ error: 'Group not found' });

        // Assign each device
        const results = await Promise.allSettled(
          parsed.data.deviceIds.map((deviceId) =>
            assignDeviceToGroup(fastify.prisma, deviceId, req.params.id, orgId, user.userId)
          )
        );

        const errors = results
          .map((r, i) => (r.status === 'rejected' ? { deviceId: parsed.data.deviceIds[i], error: (r.reason as Error).message } : null))
          .filter(Boolean);

        if (errors.length > 0) {
          return reply.status(207).send({ message: 'Some devices could not be assigned', errors });
        }

        return reply.status(204).send();
      } catch (err) {
        fastify.log.error({ err }, 'Assign devices to group error');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // DELETE /groups/:id/devices/:deviceId — remove device from group
  fastify.delete<{ Params: { id: string; deviceId: string } }>(
    '/:id/devices/:deviceId',
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      try {
        const user = req.user as JwtPayload;
        if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
          return reply.status(403).send({ error: 'Insufficient permissions' });
        }

        const orgId = req.orgId;
        if (!orgId) return reply.status(403).send({ error: 'Organization context required' });

        // Verify group belongs to org
        const group = await fastify.prisma.group.findFirst({
          where: { id: req.params.id, orgId },
        });
        if (!group) return reply.status(404).send({ error: 'Group not found' });

        await assignDeviceToGroup(fastify.prisma, req.params.deviceId, null, orgId, user.userId);
        return reply.status(204).send();
      } catch (err: unknown) {
        if (err instanceof Error && err.message === 'Device not found') {
          return reply.status(404).send({ error: 'Device not found' });
        }
        fastify.log.error({ err }, 'Remove device from group error');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );
};

export default groupsRoutes;
