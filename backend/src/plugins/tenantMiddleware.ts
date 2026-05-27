import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { JwtPayload, DeviceTokenPayload } from '../types';

const tenantMiddlewarePlugin: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    // Skip public routes
    const routeConfig = (req.routeOptions as any)?.config;
    if (routeConfig?.public === true) {
      return;
    }

    // Skip routes that have no user set yet (unauthenticated public routes)
    if (!req.user) {
      return;
    }

    const userPayload = req.user as JwtPayload | DeviceTokenPayload;
    if (userPayload.type === 'admin') {
      const adminUser = userPayload as JwtPayload;

      if (adminUser.role === 'SUPER_ADMIN') {
        // Super admins can impersonate any org via ?orgId query param
        const query = req.query as Record<string, string>;
        const impersonatedOrgId = query['orgId'];
        req.orgId = impersonatedOrgId ?? adminUser.orgId ?? undefined;
      } else {
        req.orgId = adminUser.orgId ?? undefined;
      }

      req.role = adminUser.role;
    } else if (userPayload.type === 'device') {
      const deviceUser = userPayload as DeviceTokenPayload;
      req.orgId = deviceUser.orgId;
    } else {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  });
};

export default fp(tenantMiddlewarePlugin);
