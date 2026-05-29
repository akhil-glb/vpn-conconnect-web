import apiClient from './client';
import type { Device, AuditLog, VpnSession } from '../types';

export interface DeviceDetail extends Device {
  statusHistory?: StatusHistoryEntry[];
}

export interface StatusHistoryEntry {
  id: string;
  deviceId: string;
  network: string;
  internet: string;
  vpn: string;
  ssid: string | null;
  localIP: string | null;
  gatewayIP: string | null;
  recordedAt: string;
}

export interface PaginatedResult<T> {
  total: number;
  items: T[];
}

export async function getDevices(): Promise<Device[]> {
  const response = await apiClient.get<{ devices: Device[] }>('/devices');
  return response.data.devices;
}

export async function getDevice(id: string): Promise<DeviceDetail> {
  const response = await apiClient.get<{ device: DeviceDetail }>(`/devices/${id}`);
  return response.data.device;
}

export async function revokeDevice(id: string): Promise<void> {
  await apiClient.delete(`/devices/${id}`);
}

export async function getDeviceStatusHistory(
  id: string,
  params?: { page?: number; limit?: number }
): Promise<{ total: number; statuses: StatusHistoryEntry[] }> {
  const response = await apiClient.get<{ total: number; statuses: StatusHistoryEntry[] }>(
    `/devices/${id}/status-history`,
    { params }
  );
  return response.data;
}

export async function getDeviceAuditLogs(
  id: string,
  params?: { page?: number; limit?: number }
): Promise<{ total: number; logs: AuditLog[] }> {
  const response = await apiClient.get<{ total: number; logs: AuditLog[] }>(
    `/devices/${id}/audit-logs`,
    { params }
  );
  return response.data;
}

export async function getDeviceVpnSessions(
  id: string,
  params?: { page?: number; limit?: number }
): Promise<{ total: number; sessions: VpnSession[] }> {
  const response = await apiClient.get<{ total: number; sessions: VpnSession[] }>(
    `/devices/${id}/vpn-sessions`,
    { params }
  );
  return response.data;
}

export async function overrideDevice(
  id: string,
  allow: boolean,
  durationMinutes: number
): Promise<void> {
  await apiClient.post(`/devices/${id}/override`, { allow, durationMinutes });
}

export async function generateEnrollmentToken(): Promise<{ token: string }> {
  const response = await apiClient.post<{ token: string }>('/devices/enrollment-token');
  return response.data;
}

export async function assignDeviceToGroup(deviceId: string, groupId: string): Promise<void> {
  await apiClient.post(`/groups/${groupId}/devices`, { deviceId });
}
