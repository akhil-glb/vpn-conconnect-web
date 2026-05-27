export interface JwtPayload {
  userId: string;
  role: string;
  orgId: string | null;
  type: 'admin';
}

export interface DeviceTokenPayload {
  deviceId: string;
  orgId: string;
  type: 'device';
}

export interface LiveStatus {
  deviceId: string;
  name: string;
  network: string;
  internet: string;
  vpn: string;
  vpnProfile?: string;
  ssid?: string;
  localIP?: string;
  gatewayIP?: string;
  online: boolean;
  orgId: string;
}

export interface StatusUpdateMessage {
  type: 'device_status' | 'device_offline' | 'policy_updated';
  deviceId?: string;
  name?: string;
  network?: string;
  internet?: string;
  vpn?: string;
  vpnProfile?: string;
  ssid?: string;
  localIP?: string;
  online?: boolean;
  orgId?: string;
  policyId?: string;
  policyVersion?: number;
}

export interface OverrideInstruction {
  allow: boolean;
  durationMinutes: number;
  expiresAt: string;
}

import 'fastify';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

declare module 'fastify' {
  interface FastifyRequest {
    // `user` is owned by @fastify/jwt; we do not re-declare it.
    // Use `req.user as JwtPayload` or `req.user as DeviceTokenPayload` in routes.
    orgId?: string;
    role?: string;
  }
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticateDevice: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    prisma: PrismaClient;
    redis: Redis;
  }
}
