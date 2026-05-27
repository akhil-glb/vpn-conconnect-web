import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAuditLogs, exportAuditLogs } from '../api/audit';
import { getDevices } from '../api/devices';

const LIMIT = 50;

const AUDIT_EVENT_TYPES = [
  'DEVICE_ENROLLED',
  'DEVICE_REVOKED',
  'POLICY_CREATED',
  'POLICY_UPDATED',
  'POLICY_DELETED',
  'GROUP_CREATED',
  'GROUP_UPDATED',
  'GROUP_DELETED',
  'OVERRIDE_GRANTED',
  'OVERRIDE_EXPIRED',
  'OVERRIDE_REMOVED',
  'VPN_CONNECTED',
  'VPN_DISCONNECTED',
  'STATUS_CHANGED',
  'ADMIN_LOGIN',
  'ADMIN_LOGOUT',
  'ADMIN_INVITED',
  'ADMIN_REMOVED',
];

const EVENT_BADGE_COLORS: Record<string, string> = {
  DEVICE_ENROLLED: 'bg-blue-100 text-blue-800',
  DEVICE_REVOKED: 'bg-red-100 text-red-800',
  POLICY_CREATED: 'bg-purple-100 text-purple-800',
  POLICY_UPDATED: 'bg-purple-100 text-purple-800',
  POLICY_DELETED: 'bg-red-100 text-red-800',
  GROUP_CREATED: 'bg-indigo-100 text-indigo-800',
  GROUP_UPDATED: 'bg-indigo-100 text-indigo-800',
  GROUP_DELETED: 'bg-red-100 text-red-800',
  OVERRIDE_GRANTED: 'bg-yellow-100 text-yellow-800',
  OVERRIDE_EXPIRED: 'bg-gray-100 text-gray-800',
  OVERRIDE_REMOVED: 'bg-gray-100 text-gray-800',
  VPN_CONNECTED: 'bg-green-100 text-green-800',
  VPN_DISCONNECTED: 'bg-gray-100 text-gray-800',
  STATUS_CHANGED: 'bg-orange-100 text-orange-800',
  ADMIN_LOGIN: 'bg-indigo-100 text-indigo-800',
  ADMIN_LOGOUT: 'bg-gray-100 text-gray-800',
  ADMIN_INVITED: 'bg-blue-100 text-blue-800',
  ADMIN_REMOVED: 'bg-red-100 text-red-800',
};

function formatDate(ts: string): string {
  return new Date(ts).toLocaleString();
}

export default function AuditLogs() {
  const [page, setPage] = useState(1);
  const [filterDevice, setFilterDevice] = useState('');
  const [filterEvent, setFilterEvent] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [exporting, setExporting] = useState(false);

  const params = {
    page,
    limit: LIMIT,
    deviceId: filterDevice || undefined,
    event: filterEvent || undefined,
    from: filterFrom || undefined,
    to: filterTo || undefined,
  };

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', params],
    queryFn: () => getAuditLogs(params),
  });

  const { data: devices = [] } = useQuery({
    queryKey: ['devices'],
    queryFn: getDevices,
  });

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / LIMIT);

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportAuditLogs(params);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Audit Logs</h1>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="bg-white text-gray-700 border px-4 py-2 rounded hover:bg-gray-50 disabled:opacity-50"
        >
          {exporting ? 'Exporting...' : '⬇ Export CSV'}
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Device</label>
          <select
            value={filterDevice}
            onChange={(e) => { setFilterDevice(e.target.value); setPage(1); }}
            className="border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Devices</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Event Type</label>
          <select
            value={filterEvent}
            onChange={(e) => { setFilterEvent(e.target.value); setPage(1); }}
            className="border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Events</option>
            {AUDIT_EVENT_TYPES.map((et) => (
              <option key={et} value={et}>{et.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input
            type="datetime-local"
            value={filterFrom}
            onChange={(e) => { setFilterFrom(e.target.value); setPage(1); }}
            className="border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input
            type="datetime-local"
            value={filterTo}
            onChange={(e) => { setFilterTo(e.target.value); setPage(1); }}
            className="border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="bg-white rounded-lg shadow p-12 text-center text-gray-400">
          Loading audit logs...
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="text-left p-3 bg-gray-50 border-b font-medium text-gray-600 text-sm">Timestamp</th>
                <th className="text-left p-3 bg-gray-50 border-b font-medium text-gray-600 text-sm">Device</th>
                <th className="text-left p-3 bg-gray-50 border-b font-medium text-gray-600 text-sm">Admin</th>
                <th className="text-left p-3 bg-gray-50 border-b font-medium text-gray-600 text-sm">Event</th>
                <th className="text-left p-3 bg-gray-50 border-b font-medium text-gray-600 text-sm">Detail</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-gray-400">
                    No audit logs found.
                  </td>
                </tr>
              )}
              {logs.map((log) => {
                const badgeClass =
                  EVENT_BADGE_COLORS[log.event] ?? 'bg-gray-100 text-gray-800';
                return (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="p-3 border-b text-sm whitespace-nowrap">
                      {formatDate(log.timestamp)}
                    </td>
                    <td className="p-3 border-b text-sm text-gray-700">
                      {log.deviceName ?? <span className="text-gray-400">—</span>}
                    </td>
                    <td className="p-3 border-b text-sm text-gray-600">
                      {log.adminEmail ?? <span className="text-gray-400">—</span>}
                    </td>
                    <td className="p-3 border-b">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badgeClass}`}
                      >
                        {log.event.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="p-3 border-b text-xs text-gray-500 max-w-xs">
                      {log.detail ? (
                        <span className="font-mono truncate block">
                          {JSON.stringify(log.detail)}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-gray-500">
            Showing {((page - 1) * LIMIT) + 1}–{Math.min(page * LIMIT, total)} of {total} logs
          </span>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="bg-white text-gray-700 border px-4 py-2 rounded hover:bg-gray-50 disabled:opacity-40 text-sm"
            >
              Prev
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages}
              className="bg-white text-gray-700 border px-4 py-2 rounded hover:bg-gray-50 disabled:opacity-40 text-sm"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
