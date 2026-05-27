import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  listPolicies,
  getPolicy,
  createPolicy,
  updatePolicy,
  deletePolicy,
} from '../services/policyService';
import { JwtPayload } from '../types';

const policyBodySchema = z.object({
  name: z.string().min(1).max(100),
  homeSSIDs: z.array(z.string()).optional(),
  homeGateways: z.array(z.string()).optional(),
  homeSubnets: z.array(z.string()).optional(),
  blockOnHome: z.boolean().optional(),
  blockOnUnknown: z.boolean().optional(),
  vpnProfiles: z.array(z.unknown()).optional(),
  allowOverride: z.boolean().optional(),
  overrideDurationMinutes: z.number().int().min(1).max(1440).optional(),
  allowedApps: z.array(z.string()).optional(),
  blockedApps: z.array(z.string()).optional(),
});

const policyUpdateSchema = policyBodySchema.partial();

const policiesRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /policies
  fastify.get(
    '/',
    { preHandler: [fastify.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const orgId = req.orgId;
        if (!orgId) return reply.status(403).send({ error: 'Organization context required' });

        const policies = await listPolicies(fastify.prisma, orgId);
        return reply.send({ policies });
      } catch (err) {
        fastify.log.error({ err }, 'List policies error');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // POST /policies
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

        const parsed = policyBodySchema.safeParse(req.body);
        if (!parsed.success) {
          return reply.status(400).send({ error: 'Invalid request body', details: parsed.error.flatten() });
        }

        const policy = await createPolicy(fastify.prisma, parsed.data, orgId, user.userId);
        return reply.status(201).send({ policy });
      } catch (err) {
        fastify.log.error({ err }, 'Create policy error');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // GET /policies/:id
  fastify.get(
    '/:id',
    { preHandler: [fastify.authenticate] },
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const orgId = req.orgId;
        if (!orgId) return reply.status(403).send({ error: 'Organization context required' });

        const policy = await getPolicy(fastify.prisma, req.params.id, orgId);
        if (!policy) return reply.status(404).send({ error: 'Policy not found' });

        return reply.send({ policy });
      } catch (err) {
        fastify.log.error({ err }, 'Get policy error');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // PUT /policies/:id
  fastify.put(
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

        const parsed = policyUpdateSchema.safeParse(req.body);
        if (!parsed.success) {
          return reply.status(400).send({ error: 'Invalid request body', details: parsed.error.flatten() });
        }

        const policy = await updatePolicy(fastify.prisma, req.params.id, parsed.data, orgId, user.userId);
        if (!policy) return reply.status(404).send({ error: 'Policy not found' });

        return reply.send({ policy });
      } catch (err) {
        fastify.log.error({ err }, 'Update policy error');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // DELETE /policies/:id
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

        const result = await deletePolicy(fastify.prisma, req.params.id, orgId);
        if (!result) return reply.status(404).send({ error: 'Policy not found' });

        return reply.status(204).send();
      } catch (err: unknown) {
        if (err instanceof Error && err.message.startsWith('Cannot delete policy')) {
          return reply.status(409).send({ error: err.message });
        }
        fastify.log.error({ err }, 'Delete policy error');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );
};

export default policiesRoutes;
