import { PrismaClient, AuditEvent, Prisma } from '@prisma/client';

interface LogParams {
  orgId: string;
  deviceId?: string;
  adminId?: string;
  event: AuditEvent;
  detail?: Record<string, unknown>;
}

interface AuditFilters {
  deviceId?: string;
  event?: AuditEvent;
  from?: Date;
  to?: Date;
  page: number;
  limit: number;
}

export async function log(prisma: PrismaClient, params: LogParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        orgId: params.orgId,
        deviceId: params.deviceId ?? null,
        adminId: params.adminId ?? null,
        event: params.event,
        detail: params.detail !== undefined ? params.detail as Prisma.InputJsonValue : Prisma.JsonNull,
      },
    });
  } catch (err) {
    // Audit log failure should not crash the main operation
    console.error('Failed to write audit log:', err);
  }
}

export async function listAuditLogs(
  prisma: PrismaClient,
  orgId: string,
  filters: AuditFilters
) {
  const where: Prisma.AuditLogWhereInput = {
    orgId,
    ...(filters.deviceId && { deviceId: filters.deviceId }),
    ...(filters.event && { event: filters.event }),
    ...(filters.from || filters.to
      ? {
          timestamp: {
            ...(filters.from && { gte: filters.from }),
            ...(filters.to && { lte: filters.to }),
          },
        }
      : {}),
  };

  const skip = (filters.page - 1) * filters.limit;

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: {
        device: { select: { id: true, name: true } },
        admin: { select: { id: true, email: true } },
      },
      orderBy: { timestamp: 'desc' },
      skip,
      take: filters.limit,
    }),
  ]);

  return { total, logs, page: filters.page, limit: filters.limit };
}

export async function exportCsv(
  prisma: PrismaClient,
  orgId: string,
  filters: Omit<AuditFilters, 'page' | 'limit'>
): Promise<string> {
  const where: Prisma.AuditLogWhereInput = {
    orgId,
    ...(filters.deviceId && { deviceId: filters.deviceId }),
    ...(filters.event && { event: filters.event }),
    ...(filters.from || filters.to
      ? {
          timestamp: {
            ...(filters.from && { gte: filters.from }),
            ...(filters.to && { lte: filters.to }),
          },
        }
      : {}),
  };

  const logs = await prisma.auditLog.findMany({
    where,
    include: {
      device: { select: { id: true, name: true } },
      admin: { select: { id: true, email: true } },
    },
    orderBy: { timestamp: 'desc' },
    take: 10000, // cap at 10k for safety
  });

  const headers = ['timestamp', 'event', 'deviceId', 'deviceName', 'adminId', 'adminEmail', 'detail'];
  const rows = logs.map((log) => {
    const detail = log.detail ? JSON.stringify(log.detail) : '';
    return [
      log.timestamp.toISOString(),
      log.event,
      log.device?.id ?? '',
      log.device?.name ?? '',
      log.admin?.id ?? '',
      log.admin?.email ?? '',
      `"${detail.replace(/"/g, '""')}"`,
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}
