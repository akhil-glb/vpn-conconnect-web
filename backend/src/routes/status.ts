import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { NetworkType, InternetState, VpnState } from '@prisma/client';
import { recordStatus } from '../services/statusService';
import { DeviceTokenPayload } from '../types';

const statusSchema = z.object({
  network: z.nativeEnum(NetworkType),
  internet: z.nativeEnum(InternetState),
  vpn: z.nativeEnum(VpnState),
  vpnProfile: z.string().optional(),
  ssid: z.string().optional(),
  localIP: z.string().optional(),
  gatewayIP: z.string().optional(),
});

const statusRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /status
  fastify.post(
    '/',
    { preHandler: [fastify.authenticateDevice] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const deviceUser = req.user as DeviceTokenPayload;
        const { deviceId, orgId } = deviceUser;

        const parsed = statusSchema.safeParse(req.body);
        if (!parsed.success) {
          return reply.status(400).send({ error: 'Invalid request body', details: parsed.error.flatten() });
        }

        const result = await recordStatus(deviceId, orgId, parsed.data, fastify);

        if (result?.override) {
          return reply.status(200).send({ override: result.override });
        }

        return reply.status(204).send();
      } catch (err) {
        fastify.log.error({ err }, 'Record status error');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );
};

export default statusRoutes;
