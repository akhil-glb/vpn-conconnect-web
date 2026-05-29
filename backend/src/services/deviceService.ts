import { PrismaClient, OsType, AuditEvent } from '@prisma/client';
import Redis from 'ioredis';
import { generateDeviceToken, hashDeviceToken, createEnrollmentToken } from './authService';
import { log } from './auditService';
import { LiveStatus } from '../types';

export async function enrollDevice(
  prisma: PrismaClient,
  redis: Redis,
  enrollmentData: { adminId: string; orgId: string },
  hostname: string,
  os: OsType,
  adminId: string
) {
  // Check org device limit
  const org = await prisma.organization.findUnique({
    where: { id: enrollmentData.orgId },
    include: { _count: { select: { devices: { where: { revoked: false } } } } },
  });

  if (!org) {
    throw new Error('Organization not found');
  }

  if (org._count.devices >= org.maxDevices) {
    throw new Error(`Device limit reached (max ${org.maxDevices})`);
  }

  // Generate raw token (returned once, never stored raw)
  const rawToken = generateDeviceToken();
  const tokenHash = hashDeviceToken(rawToken);

  const device = await prisma.device.create({
    data: {
      orgId: enrollmentData.orgId,
      name: hostname,
      os,
      tokenHash,
    },
  });

  await log(prisma, {
    orgId: enrollmentData.orgId,
    deviceId: device.id,
    adminId,
    event: AuditEvent.DEVICE_ENROLLED,
    detail: { hostname, os },
  });

  return { device, deviceToken: rawToken };
}

export async function listDevices(
  prisma: PrismaClient,
  redis: Redis,
  orgId: string
) {
  const devices = await prisma.device.findMany({
    where: { orgId },
    include: {
      group: {
        include: { policy: true },
      },
    },
    orderBy: { enrolledAt: 'desc' },
  });

  // Enrich with live status from Redis
  const enriched = await Promise.all(
    devices.map(async (device) => {
      const statusRaw = await redis.get(`device:status:${device.id}`);
      const online = statusRaw !== null;
      let liveStatus: Partial<LiveStatus> = { online };

      if (statusRaw) {
        try {
          const parsed = JSON.parse(statusRaw) as Partial<LiveStatus>;
          liveStatus = { ...parsed, online: true };
        } catch {
          // ignore parse errors
        }
      }

      return {
        ...device,
        groupName: device.group?.name ?? null,
        liveStatus,
      };
    })
  );

  return enriched;
}

export async function getDevice(
  prisma: PrismaClient,
  redis: Redis,
  deviceId: string,
  orgId: string
) {
  const device = await prisma.device.findFirst({
    where: { id: deviceId, orgId },
    include: {
      group: {
        include: { policy: true },
      },
    },
  });

  if (!device) {
    return null;
  }

  // Get recent statuses (last 50)
  const recentStatuses = await prisma.deviceStatus.findMany({
    where: { deviceId },
    orderBy: { reportedAt: 'desc' },
    take: 50,
  });

  // Get live status from Redis
  const statusRaw = await redis.get(`device:status:${deviceId}`);
  const online = statusRaw !== null;
  let liveStatus: Partial<LiveStatus> = { online };

  if (statusRaw) {
    try {
      const parsed = JSON.parse(statusRaw) as Partial<LiveStatus>;
      liveStatus = { ...parsed, online: true };
    } catch {
      // ignore
    }
  }

  return {
    ...device,
    groupName: device.group?.name ?? null,
    recentStatuses,
    liveStatus,
  };
}

export async function revokeDevice(
  prisma: PrismaClient,
  redis: Redis,
  deviceId: string,
  orgId: string,
  adminId: string
) {
  const device = await prisma.device.findFirst({
    where: { id: deviceId, orgId },
  });

  if (!device) {
    throw new Error('Device not found');
  }

  await prisma.device.update({
    where: { id: deviceId },
    data: { revoked: true },
  });

  // Remove live status from Redis
  await redis.del(`device:status:${deviceId}`);
  await redis.del(`device:override:${deviceId}`);

  await log(prisma, {
    orgId,
    deviceId,
    adminId,
    event: AuditEvent.DEVICE_REVOKED,
    detail: { deviceName: device.name },
  });
}

export async function assignDeviceToGroup(
  prisma: PrismaClient,
  deviceId: string,
  groupId: string | null,
  orgId: string,
  adminId: string
) {
  // Validate device belongs to org
  const device = await prisma.device.findFirst({
    where: { id: deviceId, orgId },
  });

  if (!device) {
    throw new Error('Device not found');
  }

  // Validate group belongs to org (if groupId provided)
  if (groupId) {
    const group = await prisma.group.findFirst({
      where: { id: groupId, orgId },
    });

    if (!group) {
      throw new Error('Group not found');
    }
  }

  await prisma.device.update({
    where: { id: deviceId },
    data: { groupId },
  });

  await log(prisma, {
    orgId,
    deviceId,
    adminId,
    event: AuditEvent.GROUP_CHANGED,
    detail: { groupId },
  });
}

export async function generateEnrollmentToken(
  redis: Redis,
  adminId: string,
  orgId: string
): Promise<string> {
  return createEnrollmentToken(redis, adminId, orgId);
}

export async function getDeviceStatusHistory(
  prisma: PrismaClient,
  deviceId: string,
  orgId: string,
  page: number,
  limit: number
) {
  // Verify device belongs to org
  const device = await prisma.device.findFirst({
    where: { id: deviceId, orgId },
  });

  if (!device) {
    return null;
  }

  const skip = (page - 1) * limit;
  const [total, statuses] = await Promise.all([
    prisma.deviceStatus.count({ where: { deviceId } }),
    prisma.deviceStatus.findMany({
      where: { deviceId },
      orderBy: { reportedAt: 'desc' },
      skip,
      take: limit,
    }),
  ]);

  return { total, statuses, page, limit };
}

export async function getDeviceVpnSessions(
  prisma: PrismaClient,
  deviceId: string,
  orgId: string,
  page: number,
  limit: number
) {
  const device = await prisma.device.findFirst({
    where: { id: deviceId, orgId },
  });

  if (!device) {
    return null;
  }

  const skip = (page - 1) * limit;
  const [total, sessions] = await Promise.all([
    prisma.vpnSession.count({ where: { deviceId } }),
    prisma.vpnSession.findMany({
      where: { deviceId },
      orderBy: { connectedAt: 'desc' },
      skip,
      take: limit,
    }),
  ]);

  return { total, sessions, page, limit };
}
