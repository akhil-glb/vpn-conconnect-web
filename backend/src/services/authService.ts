import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { PrismaClient, AdminRole } from '@prisma/client';
import { FastifyInstance } from 'fastify';
import Redis from 'ioredis';
import { config } from '../config';
import { JwtPayload } from '../types';

const SALT_ROUNDS = 12;
const ENROLLMENT_TOKEN_TTL = 86400; // 24 hours in seconds

export async function createAdminUser(
  prisma: PrismaClient,
  email: string,
  password: string,
  role: AdminRole,
  orgId?: string
) {
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const admin = await prisma.adminUser.create({
    data: {
      email,
      passwordHash,
      role,
      orgId: orgId ?? null,
    },
  });

  return admin;
}

export async function verifyAdminPassword(
  prisma: PrismaClient,
  email: string,
  password: string
) {
  const admin = await prisma.adminUser.findUnique({
    where: { email },
  });

  if (!admin) {
    // Run bcrypt anyway to prevent timing attacks
    await bcrypt.hash(password, SALT_ROUNDS);
    return null;
  }

  const valid = await bcrypt.compare(password, admin.passwordHash);
  if (!valid) {
    return null;
  }

  return admin;
}

export function generateDeviceToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashDeviceToken(token: string): string {
  return crypto
    .createHmac('sha256', config.deviceTokenSecret)
    .update(token)
    .digest('hex');
}

export async function createEnrollmentToken(
  redis: Redis,
  adminId: string,
  orgId: string
): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const payload = JSON.stringify({ adminId, orgId });
  await redis.setex(`enrollment:token:${tokenHash}`, ENROLLMENT_TOKEN_TTL, payload);

  return token;
}

export async function consumeEnrollmentToken(
  redis: Redis,
  token: string
): Promise<{ adminId: string; orgId: string } | null> {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const key = `enrollment:token:${tokenHash}`;

  const raw = await redis.get(key);
  if (!raw) {
    return null;
  }

  // Delete token so it can only be used once
  await redis.del(key);

  try {
    const payload = JSON.parse(raw) as { adminId: string; orgId: string };
    return payload;
  } catch {
    return null;
  }
}

export async function impersonateOrg(
  fastify: FastifyInstance,
  orgId: string,
  superAdminId: string
): Promise<string> {
  // Verify the org exists
  const org = await fastify.prisma.organization.findUnique({
    where: { id: orgId },
  });

  if (!org) {
    throw new Error('Organization not found');
  }

  const payload: JwtPayload = {
    userId: superAdminId,
    role: 'ADMIN',
    orgId,
    type: 'admin',
  };

  // Issue a short-lived token (1 hour) for impersonation
  const token = fastify.jwt.sign(payload, { expiresIn: '1h' });
  return token;
}

export async function generateAdminToken(
  fastify: FastifyInstance,
  userId: string,
  role: string,
  orgId: string | null
): Promise<string> {
  const payload: JwtPayload = {
    userId,
    role,
    orgId,
    type: 'admin',
  };

  return fastify.jwt.sign(payload);
}
