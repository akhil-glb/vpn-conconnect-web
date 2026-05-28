import { PrismaClient, AuditEvent } from '@prisma/client';
import { log } from './auditService';

export interface PolicyInput {
  name: string;
  homeSSIDs?: string[];
  homeGateways?: string[];
  homeSubnets?: string[];
  blockOnHome?: boolean;
  blockOnUnknown?: boolean;
  vpnProfiles?: unknown[];
  allowOverride?: boolean;
  overrideDurationMinutes?: number;
  allowedApps?: string[];
  blockedApps?: string[];
  adminPinHash?: string | null;
}

export async function listPolicies(prisma: PrismaClient, orgId: string) {
  return prisma.policy.findMany({
    where: { orgId },
    include: {
      _count: { select: { groups: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function getPolicy(prisma: PrismaClient, policyId: string, orgId: string) {
  const policy = await prisma.policy.findFirst({
    where: { id: policyId, orgId },
    include: {
      groups: {
        select: { id: true, name: true },
      },
    },
  });

  return policy;
}

export async function createPolicy(
  prisma: PrismaClient,
  data: PolicyInput,
  orgId: string,
  adminId: string
) {
  const policy = await prisma.policy.create({
    data: {
      orgId,
      name: data.name,
      homeSSIDs: data.homeSSIDs ?? [],
      homeGateways: data.homeGateways ?? [],
      homeSubnets: data.homeSubnets ?? [],
      blockOnHome: data.blockOnHome ?? true,
      blockOnUnknown: data.blockOnUnknown ?? true,
      vpnProfiles: data.vpnProfiles ?? [],
      allowOverride: data.allowOverride ?? false,
      overrideDurationMinutes: data.overrideDurationMinutes ?? 30,
      allowedApps: data.allowedApps ?? [],
      blockedApps: data.blockedApps ?? [],
      adminPinHash: data.adminPinHash ?? null,
    },
  });

  await log(prisma, {
    orgId,
    adminId,
    event: AuditEvent.POLICY_UPDATED,
    detail: { action: 'created', policyId: policy.id, policyName: policy.name },
  });

  return policy;
}

export async function updatePolicy(
  prisma: PrismaClient,
  policyId: string,
  data: Partial<PolicyInput>,
  orgId: string,
  adminId: string
) {
  // Verify policy belongs to org
  const existing = await prisma.policy.findFirst({
    where: { id: policyId, orgId },
  });

  if (!existing) {
    return null;
  }

  const policy = await prisma.policy.update({
    where: { id: policyId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.homeSSIDs !== undefined && { homeSSIDs: data.homeSSIDs }),
      ...(data.homeGateways !== undefined && { homeGateways: data.homeGateways }),
      ...(data.homeSubnets !== undefined && { homeSubnets: data.homeSubnets }),
      ...(data.blockOnHome !== undefined && { blockOnHome: data.blockOnHome }),
      ...(data.blockOnUnknown !== undefined && { blockOnUnknown: data.blockOnUnknown }),
      ...(data.vpnProfiles !== undefined && { vpnProfiles: data.vpnProfiles }),
      ...(data.allowOverride !== undefined && { allowOverride: data.allowOverride }),
      ...(data.overrideDurationMinutes !== undefined && {
        overrideDurationMinutes: data.overrideDurationMinutes,
      }),
      ...(data.allowedApps !== undefined && { allowedApps: data.allowedApps }),
      ...(data.blockedApps !== undefined && { blockedApps: data.blockedApps }),
      ...(data.adminPinHash !== undefined && { adminPinHash: data.adminPinHash }),
      version: { increment: 1 },
    },
  });

  await log(prisma, {
    orgId,
    adminId,
    event: AuditEvent.POLICY_UPDATED,
    detail: { action: 'updated', policyId: policy.id, policyName: policy.name, version: policy.version },
  });

  return policy;
}

export async function deletePolicy(
  prisma: PrismaClient,
  policyId: string,
  orgId: string
) {
  // Verify policy belongs to org
  const existing = await prisma.policy.findFirst({
    where: { id: policyId, orgId },
    include: { _count: { select: { groups: true } } },
  });

  if (!existing) {
    return null;
  }

  if (existing._count.groups > 0) {
    throw new Error(`Cannot delete policy: ${existing._count.groups} group(s) still use this policy`);
  }

  await prisma.policy.delete({ where: { id: policyId } });
  return true;
}

export async function getPolicyForDevice(
  prisma: PrismaClient,
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

  return device.group?.policy ?? null;
}
