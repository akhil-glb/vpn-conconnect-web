import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getDevice,
  getDeviceStatusHistory,
  getDeviceAuditLogs,
  getDeviceVpnSessions,
  overrideDevice,
  assignDeviceToGroup,
} from '../api/devices';
import { getGroups, removeDevice } from '../api/groups';
import { useAuthStore } from '../stores/authStore';
import DeviceStatusBadge from '../components/devices/DeviceStatusBadge';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

const OS_LABELS: Record<string, string> = {
  WINDOWS: '🪟 Windows',
  MACOS: '🍎 macOS',
  LINUX: '🐧 Linux',
};

function formatDate(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function DeviceDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [statusPage, setStatusPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const [overrideDuration, setOverrideDuration] = useState(60);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [groupError, setGroupError] = useState<string | null>(null);
  const LIMIT = 50;

  const { data: device, isLoading } = useQuery({
    queryKey: ['device', id],
    queryFn: () => getDevice(id!),
    enabled: !!id,
  });

  const { data: statusHistory } = useQuery({
    queryKey: ['device-status-history', id, statusPage],
    queryFn: () => getDeviceStatusHistory(id!, { page: statusPage, limit: LIMIT }),
    enabled: !!id,
  });

  const { data: auditLogs } = useQuery({
    queryKey: ['device-audit-logs', id, auditPage],
    queryFn: () => getDeviceAuditLogs(id!, { page: auditPage, limit: LIMIT }),
    enabled: !!id,
  });

  const { data: vpnSessions } = useQuery({
    queryKey: ['device-vpn-sessions', id],
    queryFn: () => getDeviceVpnSessions(id!, { limit: 200 }),
    enabled: !!id,
  });

  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: getGroups,
  });

  React.useEffect(() => {
    if (device) setSelectedGroupId(device.groupId ?? '');
  }, [device?.groupId]);

  const overrideMutation = useMutation({
    mutationFn: ({ allow, duration }: { allow: boolean; duration: number }) =>
      overrideDevice(id!, allow, duration),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['device', id] }),
  });

  const assignGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      if (groupId) {
        await assignDeviceToGroup(id!, groupId);
      } else if (device?.groupId) {
        await removeDevice(device.groupId, id!);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device', id] });
      setGroupError(null);
    },
    onError: () => {
      setGroupError('Failed to update group. Please try again.');
    },
  });

  // Build VPN session bar chart data — last 30 days
  const vpnChartData = React.useMemo(() => {
    const days: { date: string; minutes: number }[] = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      days.push({
        date: `${d.getMonth() + 1}/${d.getDate()}`,
        minutes: 0,
      });
    }
    const sessions = vpnSessions?.sessions ?? [];
    for (const s of sessions) {
      if (!s.durationSeconds || !s.connectedAt) continue;
      const connDate = new Date(s.connectedAt);
      const now2 = new Date();
      const diffDays = Math.floor((now2.getTime() - connDate.getTime()) / 86400000);
      if (diffDays < 30) {
        const idx = 29 - diffDays;
        if (days[idx]) {
          days[idx].minutes += Math.round(s.durationSeconds / 60);
        }
      }
    }
    return days;
  }, [vpnSessions]);

  if (isLoading) {
    return (
      <div className="p-6 text-center text-gray-400">Loading device details...</div>
    );
  }

  if (!device) {
    return <div className="p-6 text-center text-gray-500">Device not found.</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">{device.name}</h1>

      {/* Device Info Card */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-base font-semibold text-gray-700 mb-4">Device Information</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-gray-500">OS</span>
            <p className="font-medium mt-0.5">{OS_LABELS[device.os] ?? device.os}</p>
          </div>
          <div>
            <span className="text-gray-500">Group</span>
            <p className="font-medium mt-0.5">{device.groupName ?? '—'}</p>
          </div>
          <div>
            <span className="text-gray-500">Enrolled</span>
            <p className="font-medium mt-0.5">{formatDate(device.enrolledAt)}</p>
          </div>
          <div>
            <span className="text-gray-500">Last Seen</span>
            <p className="font-medium mt-0.5">{formatDate(device.lastSeenAt)}</p>
          </div>
          <div>
            <span className="text-gray-500">Device ID</span>
            <p className="font-mono text-xs mt-0.5 text-gray-600">{device.id}</p>
          </div>
          <div>
            <span className="text-gray-500">Status</span>
            <div className="mt-0.5">
              <DeviceStatusBadge
                network={device.network}
                internet={device.internet}
                vpn={device.vpn}
                online={device.online}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Current Status */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-base font-semibold text-gray-700 mb-4">Current Status</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Network</span>
            <p className="font-medium mt-0.5 capitalize">{device.network ?? '—'}</p>
          </div>
          <div>
            <span className="text-gray-500">Internet</span>
            <p className="font-medium mt-0.5 capitalize">{device.internet ?? '—'}</p>
          </div>
          <div>
            <span className="text-gray-500">VPN</span>
            <p className="font-medium mt-0.5 capitalize">
              {device.vpn ?? '—'}
              {device.vpnProfile ? ` (${device.vpnProfile})` : ''}
            </p>
          </div>
          <div>
            <span className="text-gray-500">SSID</span>
            <p className="font-medium mt-0.5">{device.ssid ?? '—'}</p>
          </div>
          <div>
            <span className="text-gray-500">Local IP</span>
            <p className="font-mono text-xs mt-0.5">{device.localIP ?? '—'}</p>
          </div>
          <div>
            <span className="text-gray-500">Gateway IP</span>
            <p className="font-mono text-xs mt-0.5">{device.gatewayIP ?? '—'}</p>
          </div>
        </div>
      </div>

      {/* Override Controls — ADMIN only */}
      {(user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN') && (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-base font-semibold text-gray-700 mb-4">Override Controls</h2>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Duration (minutes):</label>
            <input
              type="number"
              min={1}
              max={1440}
              value={overrideDuration}
              onChange={(e) => setOverrideDuration(Number(e.target.value))}
              className="border rounded px-3 py-2 w-24 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
          <button
            onClick={() => overrideMutation.mutate({ allow: true, duration: overrideDuration })}
            disabled={overrideMutation.isPending}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            Allow Override
          </button>
          <button
            onClick={() => overrideMutation.mutate({ allow: false, duration: 0 })}
            disabled={overrideMutation.isPending}
            className="bg-white text-gray-700 border px-4 py-2 rounded hover:bg-gray-50 disabled:opacity-50"
          >
            Remove Override
          </button>
          {overrideMutation.isSuccess && (
            <span className="text-green-600 text-sm">Override applied.</span>
          )}
        </div>
      </div>
      )}

      {/* Group Assignment (ADMIN only) */}
      {(user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN') && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-base font-semibold text-gray-700 mb-4">Group Assignment</h2>
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={selectedGroupId}
              onChange={(e) => { setSelectedGroupId(e.target.value); setGroupError(null); }}
              className="border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— No group —</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            <button
              onClick={() => assignGroupMutation.mutate(selectedGroupId)}
              disabled={assignGroupMutation.isPending || selectedGroupId === (device.groupId ?? '')}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50 text-sm"
            >
              {assignGroupMutation.isPending ? 'Saving...' : 'Save'}
            </button>
            {assignGroupMutation.isSuccess && (
              <span className="text-green-600 text-sm">Group updated.</span>
            )}
            {groupError && (
              <span className="text-red-600 text-sm">{groupError}</span>
            )}
          </div>
        </div>
      )}

      {/* VPN Session Chart */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-base font-semibold text-gray-700 mb-4">
          VPN Usage — Last 30 Days (minutes/day)
        </h2>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={vpnChartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: '#6b7280' }}
              tickLine={false}
              interval={4}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#6b7280' }}
              tickLine={false}
              axisLine={false}
              width={35}
            />
            <Tooltip
              contentStyle={{ fontSize: '12px', border: '1px solid #e5e7eb', borderRadius: '6px' }}
            />
            <Bar dataKey="minutes" fill="#3b82f6" radius={[2, 2, 0, 0]} name="Minutes" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Status History */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-base font-semibold text-gray-700 mb-4">Status History</h2>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="text-left p-3 bg-gray-50 border-b font-medium text-gray-600 text-sm">Time</th>
              <th className="text-left p-3 bg-gray-50 border-b font-medium text-gray-600 text-sm">Network</th>
              <th className="text-left p-3 bg-gray-50 border-b font-medium text-gray-600 text-sm">Internet</th>
              <th className="text-left p-3 bg-gray-50 border-b font-medium text-gray-600 text-sm">VPN</th>
              <th className="text-left p-3 bg-gray-50 border-b font-medium text-gray-600 text-sm">SSID</th>
              <th className="text-left p-3 bg-gray-50 border-b font-medium text-gray-600 text-sm">Local IP</th>
            </tr>
          </thead>
          <tbody>
            {(statusHistory?.statuses ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-center text-gray-400">No history.</td>
              </tr>
            )}
            {(statusHistory?.statuses ?? []).map((s) => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="p-3 border-b text-sm">{formatDate(s.recordedAt)}</td>
                <td className="p-3 border-b text-sm capitalize">{s.network}</td>
                <td className="p-3 border-b text-sm capitalize">{s.internet}</td>
                <td className="p-3 border-b text-sm capitalize">{s.vpn}</td>
                <td className="p-3 border-b text-sm">{s.ssid ?? '—'}</td>
                <td className="p-3 border-b text-sm font-mono text-xs">{s.localIP ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(statusHistory?.total ?? 0) > LIMIT && (
          <div className="flex justify-between items-center mt-4">
            <span className="text-sm text-gray-500">
              Page {statusPage} of {Math.ceil((statusHistory?.total ?? 0) / LIMIT)}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setStatusPage((p) => Math.max(1, p - 1))}
                disabled={statusPage === 1}
                className="bg-white text-gray-700 border px-4 py-2 rounded hover:bg-gray-50 disabled:opacity-40 text-sm"
              >
                Prev
              </button>
              <button
                onClick={() => setStatusPage((p) => p + 1)}
                disabled={statusPage >= Math.ceil((statusHistory?.total ?? 0) / LIMIT)}
                className="bg-white text-gray-700 border px-4 py-2 rounded hover:bg-gray-50 disabled:opacity-40 text-sm"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Audit Logs */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-base font-semibold text-gray-700 mb-4">Audit Logs</h2>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="text-left p-3 bg-gray-50 border-b font-medium text-gray-600 text-sm">Timestamp</th>
              <th className="text-left p-3 bg-gray-50 border-b font-medium text-gray-600 text-sm">Event</th>
              <th className="text-left p-3 bg-gray-50 border-b font-medium text-gray-600 text-sm">Admin</th>
              <th className="text-left p-3 bg-gray-50 border-b font-medium text-gray-600 text-sm">Detail</th>
            </tr>
          </thead>
          <tbody>
            {(auditLogs?.logs ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="p-4 text-center text-gray-400">No audit logs.</td>
              </tr>
            )}
            {(auditLogs?.logs ?? []).map((log) => (
              <tr key={log.id} className="hover:bg-gray-50">
                <td className="p-3 border-b text-sm">{formatDate(log.timestamp)}</td>
                <td className="p-3 border-b">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                    {log.event}
                  </span>
                </td>
                <td className="p-3 border-b text-sm text-gray-600">{log.adminEmail ?? '—'}</td>
                <td className="p-3 border-b text-xs text-gray-500 max-w-xs truncate">
                  {log.detail ? JSON.stringify(log.detail) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(auditLogs?.total ?? 0) > LIMIT && (
          <div className="flex justify-between items-center mt-4">
            <span className="text-sm text-gray-500">
              Page {auditPage} of {Math.ceil((auditLogs?.total ?? 0) / LIMIT)}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                disabled={auditPage === 1}
                className="bg-white text-gray-700 border px-4 py-2 rounded hover:bg-gray-50 disabled:opacity-40 text-sm"
              >
                Prev
              </button>
              <button
                onClick={() => setAuditPage((p) => p + 1)}
                disabled={auditPage >= Math.ceil((auditLogs?.total ?? 0) / LIMIT)}
                className="bg-white text-gray-700 border px-4 py-2 rounded hover:bg-gray-50 disabled:opacity-40 text-sm"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
