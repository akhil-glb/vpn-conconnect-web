import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Device } from '../../types';
import DeviceStatusBadge from './DeviceStatusBadge';
import { revokeDevice } from '../../api/devices';

interface DeviceTableProps {
  devices: Device[];
}

const OS_EMOJI: Record<string, string> = {
  WINDOWS: '🪟',
  MACOS: '🍎',
  LINUX: '🐧',
};

function formatLastSeen(ts: string | null): string {
  if (!ts) return 'Never';
  const date = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export default function DeviceTable({ devices }: DeviceTableProps) {
  const [search, setSearch] = useState('');
  const [filterGroup, setFilterGroup] = useState('');
  const [filterOS, setFilterOS] = useState('');
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revokeDevice(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      setConfirmRevokeId(null);
    },
  });

  const groups = Array.from(new Set(devices.map((d) => d.groupName).filter(Boolean))) as string[];

  const filtered = devices
    .filter((d) => {
      if (search && !d.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterGroup && d.groupName !== filterGroup) return false;
      if (filterOS && d.os !== filterOS) return false;
      return true;
    })
    .sort((a, b) => {
      if (!a.lastSeenAt) return 1;
      if (!b.lastSeenAt) return -1;
      return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
    });

  return (
    <div>
      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <input
          type="text"
          placeholder="Search by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border rounded px-3 py-2 w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={filterOS}
          onChange={(e) => setFilterOS(e.target.value)}
          className="border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All OS</option>
          <option value="WINDOWS">Windows</option>
          <option value="MACOS">macOS</option>
          <option value="LINUX">Linux</option>
        </select>
        <select
          value={filterGroup}
          onChange={(e) => setFilterGroup(e.target.value)}
          className="border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Groups</option>
          {groups.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="text-left p-3 bg-gray-50 border-b font-medium text-gray-600 text-sm">Name</th>
              <th className="text-left p-3 bg-gray-50 border-b font-medium text-gray-600 text-sm">OS</th>
              <th className="text-left p-3 bg-gray-50 border-b font-medium text-gray-600 text-sm">Group</th>
              <th className="text-left p-3 bg-gray-50 border-b font-medium text-gray-600 text-sm">Status</th>
              <th className="text-left p-3 bg-gray-50 border-b font-medium text-gray-600 text-sm">VPN</th>
              <th className="text-left p-3 bg-gray-50 border-b font-medium text-gray-600 text-sm">Last Seen</th>
              <th className="text-left p-3 bg-gray-50 border-b font-medium text-gray-600 text-sm">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-gray-500">
                  No devices found.
                </td>
              </tr>
            )}
            {filtered.map((device) => (
              <tr key={device.id} className={`hover:bg-gray-50 ${device.revoked ? 'opacity-50' : ''}`}>
                <td className="p-3 border-b">
                  <Link
                    to={`/devices/${device.id}`}
                    className="font-medium text-blue-600 hover:text-blue-700"
                  >
                    {device.name}
                  </Link>
                  {device.revoked && (
                    <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                      Revoked
                    </span>
                  )}
                </td>
                <td className="p-3 border-b">
                  <span title={device.os}>{OS_EMOJI[device.os] ?? device.os}</span>
                </td>
                <td className="p-3 border-b text-sm text-gray-600">
                  {device.groupName ?? <span className="text-gray-400">—</span>}
                </td>
                <td className="p-3 border-b">
                  <DeviceStatusBadge
                    network={device.network}
                    internet={device.internet}
                    vpn={device.vpn}
                    online={device.online}
                  />
                </td>
                <td className="p-3 border-b text-sm text-gray-600">
                  {device.vpnProfile ?? <span className="text-gray-400">—</span>}
                </td>
                <td className="p-3 border-b text-sm text-gray-600">
                  {formatLastSeen(device.lastSeenAt)}
                </td>
                <td className="p-3 border-b">
                  {!device.revoked && (
                    <button
                      onClick={() => setConfirmRevokeId(device.id)}
                      className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700"
                    >
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Confirm revoke dialog */}
      {confirmRevokeId && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">Revoke Device?</h3>
            <p className="text-gray-600 text-sm mb-4">
              This will permanently revoke the device's access. The device will no longer be able to authenticate.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmRevokeId(null)}
                className="bg-white text-gray-700 border px-4 py-2 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => revokeMutation.mutate(confirmRevokeId)}
                disabled={revokeMutation.isPending}
                className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:opacity-50"
              >
                {revokeMutation.isPending ? 'Revoking...' : 'Revoke'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
