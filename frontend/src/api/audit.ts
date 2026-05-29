import apiClient from './client';
import type { AuditLog } from '../types';

export interface AuditLogsParams {
  page?: number;
  limit?: number;
  deviceId?: string;
  event?: string;
  from?: string;
  to?: string;
}

export async function getAuditLogs(
  params?: AuditLogsParams
): Promise<{ total: number; logs: AuditLog[] }> {
  const response = await apiClient.get<{ total: number; logs: AuditLog[] }>('/audit-logs', {
    params,
  });
  return response.data;
}

export async function exportAuditLogs(params?: AuditLogsParams): Promise<void> {
  const response = await apiClient.get('/audit-logs/export', {
    params,
    responseType: 'blob',
  });
  const url = URL.createObjectURL(response.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function logCopyEvent(fieldName: string): Promise<void> {
  // fire-and-forget: audit failure must never interrupt the UX
  try {
    await apiClient.post('/audit-logs/copy-event', { fieldName });
  } catch {
    // silent
  }
}
