import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getVpnSessions, exportVpnSessions } from '../api/vpnSessions';
import { getGroups } from '../api/groups';
import { getDevices } from '../api/devices';

const LIMIT = 50;

function formatDate(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function VpnSessions() {
  const [page, setPage] = useState(1);
  const [filterDevice, setFilterDevice] = useState('');
  const [filterGroup, setFilterGroup] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const [exporting, setExporting] = useState(false);

  const params = {
    page,
    limit: LIMIT,
    deviceId: filterDevice || undefined,
    groupId: filterGroup || undefined,
    from: filterFrom || undefined,
    to: filterTo || undefined,
    activeOnly: activeOnly || undefined,
  };

  const { data, isLoading } = useQuery({
    queryKey: ['vpn-sessions', params],
    queryFn: () => getVpnSessions(params),
  });

  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: getGroups,
  });

  const { data: devices = [] } = useQuery({
    queryKey: ['devices'],
    queryFn: getDevices,
  });

  const sessions = data?.sessions ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / LIMIT);

  const totalHours = sessions.reduce((acc, s) => acc + (s.durationSeconds ?? 0), 0) / 3600;

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportVpnSessions(params);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">VPN Sessions</h1>
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
          <label className="block text-xs text-gray-500 mb-1">Group</label>
          <select
            value={filterGroup}
            onChange={(e) => { setFilterGroup(e.target.value); setPage(1); }}
            className="border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Groups</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
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
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(e) => { setActiveOnly(e.target.checked); setPage(1); }}
          />
          Active only
        </label>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="bg-white rounded-lg shadow p-12 text-center text-gray-400">
          Loading sessions...
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="text-left p-3 bg-gray-50 border-b font-medium text-gray-600 text-sm">Device</th>
                <th className="text-left p-3 bg-gray-50 border-b font-medium text-gray-600 text-sm">Group</th>
                <th className="text-left p-3 bg-gray-50 border-b font-medium text-gray-600 text-sm">VPN Profile</th>
                <th className="text-left p-3 bg-gray-50 border-b font-medium text-gray-600 text-sm">Connected</th>
                <th className="text-left p-3 bg-gray-50 border-b font-medium text-gray-600 text-sm">Disconnected</th>
                <th className="text-left p-3 bg-gray-50 border-b font-medium text-gray-600 text-sm">Duration</th>
                <th className="text-left p-3 bg-gray-50 border-b font-medium text-gray-600 text-sm">Terminated By</th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-gray-400">
                    No VPN sessions found.
                  </td>
                </tr>
              )}
              {sessions.map((s) => {
                const isActive = !s.disconnectedAt;
                return (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="p-3 border-b">
                      <div className="flex items-center gap-2">
                        {isActive && (
                          <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                        )}
                        <span className="text-sm font-medium text-gray-900">{s.deviceName}</span>
                        {isActive && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                            active
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 border-b text-sm text-gray-600">
                      {s.groupName ?? '—'}
                    </td>
                    <td className="p-3 border-b text-sm text-gray-600">
                      {s.vpnProfileDisplay ?? s.vpnProfileName ?? '—'}
                    </td>
                    <td className="p-3 border-b text-sm">{formatDate(s.connectedAt)}</td>
                    <td className="p-3 border-b text-sm">{formatDate(s.disconnectedAt)}</td>
                    <td className="p-3 border-b text-sm">{formatDuration(s.durationSeconds)}</td>
                    <td className="p-3 border-b text-sm text-gray-600">
                      {s.terminatedBy ?? '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary Footer */}
      <div className="mt-4 flex items-center justify-between">
        <div className="text-sm text-gray-600">
          <span className="font-medium">{total}</span> total sessions &nbsp;|&nbsp;
          <span className="font-medium">{totalHours.toFixed(1)}</span> hours (this page)
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
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
        )}
      </div>
    </div>
  );
}
