import { PrismaClient, NetworkType, InternetState, VpnState, AuditEvent, TerminationReason } from '@prisma/client';
import Redis from 'ioredis';
import { FastifyInstance } from 'fastify';
import { log } from './auditService';
import { LiveStatus, StatusUpdateMessage, OverrideInstruction } from '../types';

interface StatusInput {
  network: NetworkType;
  internet: InternetState;
  vpn: VpnState;
  vpnProfile?: string;
  ssid?: string;
  localIP?: string;
  gatewayIP?: string;
}

interface PreviousStatus {
  vpn: VpnState;
  internet: InternetState;
  network: NetworkType;
  vpnProfile?: string;
  ssid?: string;
}

const STATUS_TTL_SECONDS = 60;

export async function recordStatus(
  deviceId: string,
  orgId: string,
  statusData: StatusInput,
  fastify: FastifyInstance
): Promise<{ override?: OverrideInstruction } | void> {
  const prisma = fastify.prisma;
  const redis = fastify.redis;

  // 1. Read previous status from Redis
  const prevRaw = await redis.get(`device:status:${deviceId}`);
  let prevStatus: PreviousStatus | null = null;
  if (prevRaw) {
    try {
      prevStatus = JSON.parse(prevRaw) as PreviousStatus;
    } catch {
      // ignore
    }
  }

  // 2. Get device name for publishing
  const device = await prisma.device.findUnique({
    where: { id: deviceId },
    select: { name: true, id: true },
  });

  const liveStatus: LiveStatus = {
    deviceId,
    name: device?.name ?? deviceId,
    network: statusData.network,
    internet: statusData.internet,
    vpn: statusData.vpn,
    vpnProfile: statusData.vpnProfile,
    ssid: statusData.ssid,
    localIP: statusData.localIP,
    gatewayIP: statusData.gatewayIP,
    online: true,
    orgId,
  };

  // 2. Write new status to Redis with TTL
  await redis.setex(
    `device:status:${deviceId}`,
    STATUS_TTL_SECONDS,
    JSON.stringify(liveStatus)
  );

  // 3. Insert DeviceStatus row in PostgreSQL
  await prisma.deviceStatus.create({
    data: {
      deviceId,
      networkType: statusData.network,
      internetState: statusData.internet,
      vpnState: statusData.vpn,
      vpnProfile: statusData.vpnProfile ?? null,
      ssid: statusData.ssid ?? null,
      localIP: statusData.localIP ?? null,
      gatewayIP: statusData.gatewayIP ?? null,
    },
  });

  // 4. Update device.lastSeenAt
  await prisma.device.update({
    where: { id: deviceId },
    data: { lastSeenAt: new Date() },
  });

  // 5. Handle VPN session lifecycle
  const now = new Date();
  const prevVpn = prevStatus?.vpn;
  const currVpn = statusData.vpn;

  if (
    (prevVpn === VpnState.DISCONNECTED || prevVpn === VpnState.CONNECTING || prevVpn === null || prevVpn === undefined) &&
    currVpn === VpnState.CONNECTED
  ) {
    // VPN just connected — open a new session
    await prisma.vpnSession.create({
      data: {
        orgId,
        deviceId,
        vpnProfileName: statusData.vpnProfile ?? null,
        vpnProfileDisplay: statusData.vpnProfile ?? null,
        networkAtConnect: statusData.network,
        ssidAtConnect: statusData.ssid ?? null,
        connectedAt: now,
      },
    });

    await log(prisma, {
      orgId,
      deviceId,
      event: AuditEvent.VPN_CONNECTED,
      detail: { vpnProfile: statusData.vpnProfile, network: statusData.network },
    });
  } else if (prevVpn === VpnState.CONNECTED && currVpn === VpnState.DISCONNECTED) {
    // VPN disconnected — close the open session
    await closeOpenVpnSession(prisma, deviceId, now, TerminationReason.USER_DISCONNECT);

    await log(prisma, {
      orgId,
      deviceId,
      event: AuditEvent.VPN_DISCONNECTED,
      detail: { terminatedBy: 'USER_DISCONNECT' },
    });
  } else if (prevVpn === VpnState.CONNECTED && currVpn === VpnState.ERROR) {
    // VPN errored — close the open session
    await closeOpenVpnSession(prisma, deviceId, now, TerminationReason.SERVICE_RESTART);

    await log(prisma, {
      orgId,
      deviceId,
      event: AuditEvent.VPN_DISCONNECTED,
      detail: { terminatedBy: 'SERVICE_RESTART' },
    });
  }

  // 6. Audit logs for internet state changes
  if (prevStatus && prevStatus.internet !== statusData.internet) {
    if (statusData.internet === InternetState.BLOCKED) {
      await log(prisma, {
        orgId,
        deviceId,
        event: AuditEvent.INTERNET_BLOCKED,
        detail: { network: statusData.network },
      });
    } else if (statusData.internet === InternetState.ALLOWED) {
      await log(prisma, {
        orgId,
        deviceId,
        event: AuditEvent.INTERNET_ALLOWED,
        detail: { network: statusData.network },
      });
    }
  }

  // 7. Publish to Redis pub/sub for WebSocket handler
  const wsMessage: StatusUpdateMessage = {
    type: 'device_status',
    deviceId,
    name: device?.name ?? deviceId,
    network: statusData.network,
    internet: statusData.internet,
    vpn: statusData.vpn,
    vpnProfile: statusData.vpnProfile,
    ssid: statusData.ssid,
    localIP: statusData.localIP,
    online: true,
    orgId,
  };

  await redis.publish('status:updates', JSON.stringify(wsMessage));

  // 8. Check for remote override instruction
  const overrideRaw = await redis.get(`device:override:${deviceId}`);
  if (overrideRaw) {
    try {
      const override = JSON.parse(overrideRaw) as OverrideInstruction;
      // Only return override if it's still valid
      if (new Date(override.expiresAt) > now) {
        return { override };
      } else {
        // Override expired, clean up
        await redis.del(`device:override:${deviceId}`);
      }
    } catch {
      // ignore
    }
  }
}

async function closeOpenVpnSession(
  prisma: PrismaClient,
  deviceId: string,
  now: Date,
  terminatedBy: TerminationReason
) {
  const openSession = await prisma.vpnSession.findFirst({
    where: {
      deviceId,
      disconnectedAt: null,
    },
    orderBy: { connectedAt: 'desc' },
  });

  if (openSession) {
    const durationSeconds = Math.floor(
      (now.getTime() - openSession.connectedAt.getTime()) / 1000
    );

    await prisma.vpnSession.update({
      where: { id: openSession.id },
      data: {
        disconnectedAt: now,
        durationSeconds,
        terminatedBy,
      },
    });
  }
}

export async function handleDeviceOffline(
  deviceId: string,
  orgId: string,
  prisma: PrismaClient,
  redis: Redis
) {
  const now = new Date();

  // Close any open VPN session for this device
  await closeOpenVpnSession(prisma, deviceId, now, TerminationReason.DEVICE_OFFLINE);

  // Publish offline event to status:updates channel
  const message: StatusUpdateMessage = {
    type: 'device_offline',
    deviceId,
    orgId,
    online: false,
  };

  await redis.publish('status:updates', JSON.stringify(message));

  await log(prisma, {
    orgId,
    deviceId,
    event: AuditEvent.VPN_DISCONNECTED,
    detail: { terminatedBy: 'DEVICE_OFFLINE' },
  });
}

export async function setDeviceOverride(
  redis: Redis,
  deviceId: string,
  allow: boolean,
  durationMinutes: number
): Promise<OverrideInstruction> {
  const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);

  const override: OverrideInstruction = {
    allow,
    durationMinutes,
    expiresAt: expiresAt.toISOString(),
  };

  const ttlSeconds = durationMinutes * 60;
  await redis.setex(`device:override:${deviceId}`, ttlSeconds, JSON.stringify(override));

  return override;
}
