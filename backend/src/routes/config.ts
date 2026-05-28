import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { getPolicyForDevice } from '../services/policyService';
import { DeviceTokenPayload } from '../types';

const configRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /config — return policy config for the calling device
  fastify.get(
    '/',
    { preHandler: [fastify.authenticateDevice] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const deviceUser = req.user as DeviceTokenPayload;
        const { deviceId, orgId } = deviceUser;

        const policy = await getPolicyForDevice(fastify.prisma, deviceId, orgId);

        if (!policy) {
          // Device has no group/policy assigned
          return reply.status(204).send();
        }

        return reply.send({
          policyId: policy.id,
          name: policy.name,
          version: policy.version,
          homeSSIDs: policy.homeSSIDs,
          homeGateways: policy.homeGateways,
          homeSubnets: policy.homeSubnets,
          blockOnHome: policy.blockOnHome,
          blockOnUnknown: policy.blockOnUnknown,
          vpnProfiles: policy.vpnProfiles,
          allowOverride: policy.allowOverride,
          overrideDurationMinutes: policy.overrideDurationMinutes,
          allowedApps: policy.allowedApps,
          blockedApps: policy.blockedApps,
          adminPinHash: policy.adminPinHash,
        });
      } catch (err) {
        fastify.log.error({ err }, 'Get config error');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );
};

export default configRoutes;
