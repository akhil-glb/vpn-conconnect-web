import { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { WebSocket } from '@fastify/websocket';
import Redis from 'ioredis';
import { config } from '../../config';
import { JwtPayload, StatusUpdateMessage } from '../../types';

const dashboardWsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/ws/dashboard',
    { websocket: true },
    async (socket: WebSocket, req: FastifyRequest) => {
      let orgId: string | null = null;
      let subscriber: Redis | null = null;

      // Authenticate via token in query string or Authorization header
      try {
        const query = req.query as Record<string, string>;
        const tokenFromQuery = query['token'];
        const authHeader = req.headers.authorization;

        let rawToken: string | null = null;

        if (tokenFromQuery) {
          rawToken = tokenFromQuery;
        } else if (authHeader?.startsWith('Bearer ')) {
          rawToken = authHeader.slice(7);
        }

        if (!rawToken) {
          socket.send(JSON.stringify({ type: 'error', message: 'Authentication required' }));
          socket.close(1008, 'Authentication required');
          return;
        }

        let decoded: JwtPayload;
        try {
          decoded = fastify.jwt.verify<JwtPayload>(rawToken);
        } catch {
          socket.send(JSON.stringify({ type: 'error', message: 'Invalid or expired token' }));
          socket.close(1008, 'Invalid token');
          return;
        }

        if (decoded.type !== 'admin') {
          socket.send(JSON.stringify({ type: 'error', message: 'Admin token required' }));
          socket.close(1008, 'Admin token required');
          return;
        }

        // For super admin, use query orgId param or their own orgId
        if (decoded.role === 'SUPER_ADMIN') {
          orgId = query['orgId'] ?? decoded.orgId ?? null;
        } else {
          orgId = decoded.orgId ?? null;
        }

        if (!orgId) {
          socket.send(JSON.stringify({ type: 'error', message: 'Organization context required' }));
          socket.close(1008, 'Organization context required');
          return;
        }

        // Send connection acknowledgement
        socket.send(JSON.stringify({ type: 'connected', orgId }));

        // Create a dedicated Redis subscriber connection
        subscriber = new Redis(config.redisUrl);

        subscriber.on('error', (err) => {
          fastify.log.error({ err }, 'WebSocket Redis subscriber error');
        });

        await subscriber.subscribe('status:updates');

        subscriber.on('message', (_channel: string, message: string) => {
          try {
            const parsed = JSON.parse(message) as StatusUpdateMessage;

            // Only forward messages matching this client's org
            if (parsed.orgId !== orgId && parsed.type !== 'policy_updated') {
              return;
            }

            // For policy_updated, check if it belongs to this org
            if (parsed.type === 'policy_updated' && parsed.orgId !== orgId) {
              return;
            }

            if (socket.readyState === socket.OPEN) {
              socket.send(JSON.stringify(parsed));
            }
          } catch {
            // ignore malformed messages
          }
        });

        // Handle incoming messages from client (e.g., ping)
        socket.on('message', (data: Buffer) => {
          try {
            const msg = JSON.parse(data.toString()) as { type?: string };
            if (msg.type === 'ping') {
              socket.send(JSON.stringify({ type: 'pong' }));
            }
          } catch {
            // ignore
          }
        });

        // Clean up on close
        socket.on('close', async () => {
          if (subscriber) {
            try {
              await subscriber.unsubscribe('status:updates');
              subscriber.disconnect();
            } catch {
              // ignore cleanup errors
            }
            subscriber = null;
          }
        });
      } catch (err) {
        fastify.log.error({ err }, 'WebSocket dashboard handler error');
        try {
          socket.close(1011, 'Internal server error');
        } catch {
          // ignore
        }
        if (subscriber) {
          try {
            subscriber.disconnect();
          } catch {
            // ignore
          }
        }
      }
    }
  );
};

export default dashboardWsRoute;
