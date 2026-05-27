import React from 'react';

interface DeviceStatusBadgeProps {
  network?: string;
  internet?: string;
  vpn?: string;
  online?: boolean;
}

export default function DeviceStatusBadge({ network, internet, vpn, online }: DeviceStatusBadgeProps) {
  if (!online) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
        <span className="text-gray-400">○</span>
        Offline
      </span>
    );
  }

  const isBlocked = internet === 'blocked' || internet === 'BLOCKED';
  const isOffice = network === 'office' || network === 'OFFICE';
  const isHome = network === 'home' || network === 'HOME';
  const isVpnConnected = vpn === 'connected' || vpn === 'CONNECTED';

  if (isOffice || (!isHome && !isBlocked)) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
        <span className="text-green-500">●</span>
        {isOffice ? 'Office' : 'Online'} — {isVpnConnected ? 'VPN' : 'Allowed'}
      </span>
    );
  }

  if (isHome && isBlocked) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
        <span className="text-red-500">●</span>
        Home — Blocked
      </span>
    );
  }

  if (isHome) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
        <span className="text-yellow-500">●</span>
        Home — {isVpnConnected ? 'VPN' : 'Allowed'}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
      <span className="text-gray-400">●</span>
      {network ?? 'Unknown'}
    </span>
  );
}
