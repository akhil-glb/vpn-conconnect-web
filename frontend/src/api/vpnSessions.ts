import apiClient from './client';
import type { VpnSession } from '../types';

export interface VpnSessionsParams {
  page?: number;
  limit?: number;
  deviceId?: string;
  groupId?: string;
  from?: string;
  to?: string;
  activeOnly?: boolean;
}

export interface SummaryItem {
  date: string;
  count: number;
  totalSeconds: number;
}

export async function getVpnSessions(
  params?: VpnSessionsParams
): Promise<{ total: number; sessions: VpnSession[] }> {
  const response = await apiClient.get<{ total: number; sessions: VpnSession[] }>(
    '/vpn-sessions',
    { params }
  );
  return response.data;
}

export async function getVpnSessionSummary(params?: VpnSessionsParams): Promise<SummaryItem[]> {
  const response = await apiClient.get<SummaryItem[]>('/vpn-sessions/summary', { params });
  return response.data;
}

export async function exportVpnSessions(params?: VpnSessionsParams): Promise<void> {
  const response = await apiClient.get('/vpn-sessions/export', {
    params,
    responseType: 'blob',
  });
  const url = URL.createObjectURL(response.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vpn-sessions-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
