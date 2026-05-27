import React from 'react';
import { Link } from 'react-router-dom';
import type { Device } from '../../types';
import DeviceStatusBadge from './DeviceStatusBadge';

interface DeviceCardProps {
  device: Device;
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

export default function DeviceCard({ device }: DeviceCardProps) {
  return (
    <Link to={`/devices/${device.id}`} className="block">
      <div className="bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">{OS_EMOJI[device.os] ?? '💻'}</span>
            <span className="font-medium text-gray-900 text-sm">{device.name}</span>
          </div>
          <DeviceStatusBadge
            network={device.network}
            internet={device.internet}
            vpn={device.vpn}
            online={device.online}
          />
        </div>
        <div className="text-xs text-gray-500 mt-2 space-y-0.5">
          {device.groupName && (
            <div>Group: <span className="text-gray-700">{device.groupName}</span></div>
          )}
          <div>Last seen: <span className="text-gray-700">{formatLastSeen(device.lastSeenAt)}</span></div>
        </div>
      </div>
    </Link>
  );
}
