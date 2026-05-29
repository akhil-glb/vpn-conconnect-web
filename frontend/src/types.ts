export interface Device {
  id: string;
  name: string;
  os: 'WINDOWS' | 'MACOS' | 'LINUX';
  groupId: string | null;
  groupName?: string;
  revoked: boolean;
  enrolledAt: string;
  lastSeenAt: string | null;
  // from Redis:
  online?: boolean;
  network?: string;
  internet?: string;
  vpn?: string;
  vpnProfile?: string;
  ssid?: string;
  localIP?: string;
  gatewayIP?: string;
}

export interface Policy {
  id: string;
  name: string;
  orgId: string;
  homeSSIDs: string[];
  homeGateways: string[];
  homeSubnets: string[];
  blockOnHome: boolean;
  blockOnUnknown: boolean;
  allowOverride: boolean;
  overrideDurationMinutes: number;
  allowedApps: string[];
  blockedApps: string[];
  vpnProfiles: VpnProfile[];
  adminPinHash: string | null;
  version: number;
  updatedAt: string;
}

export type VpnTunnelType = 'L2TP' | 'IKEv2' | 'PPTP' | 'SSTP' | 'Automatic';
export type VpnAuthMethod = 'MSChapV2' | 'Chap' | 'Pap' | 'EAP' | 'MachineCertificate';
export type VpnEncryptionLevel = 'NoEncryption' | 'Optional' | 'Required' | 'Maximum' | 'Custom';

export interface VpnProfile {
  name: string;
  displayName: string;
  isDefault: boolean;
  serverAddress: string;
  tunnelType: VpnTunnelType;
  l2tpPsk?: string;
  authenticationMethod: VpnAuthMethod;
  encryptionLevel: VpnEncryptionLevel;
  rememberCredential: boolean;
}

export interface Group {
  id: string;
  name: string;
  policyId: string | null;
  policyName?: string;
  orgId: string;
  deviceCount?: number;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  event: string;
  deviceId: string | null;
  deviceName?: string;
  adminId: string | null;
  adminEmail?: string;
  detail: Record<string, unknown> | null;
  timestamp: string;
}

export interface VpnSession {
  id: string;
  deviceId: string;
  deviceName: string;
  groupName?: string;
  vpnProfileName: string | null;
  vpnProfileDisplay: string | null;
  networkAtConnect: string | null;
  ssidAtConnect: string | null;
  connectedAt: string;
  disconnectedAt: string | null;
  durationSeconds: number | null;
  terminatedBy: string | null;
  vpnServerAddress?: string | null;
  vpnTunnelType?: string | null;
}

export interface AdminUser {
  id: string;
  email: string;
  role: string;
  orgId: string | null;
  createdAt: string;
}
