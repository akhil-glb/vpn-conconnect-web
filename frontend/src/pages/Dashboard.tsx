import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLiveDevices } from '../hooks/useLiveDevices';
import { getAuditLogs } from '../api/audit';
import DeviceStateChart from '../components/charts/DeviceStateChart';
import ActivityTimeline from '../components/charts/ActivityTimeline';
import DeviceCard from '../components/devices/DeviceCard';

interface StatCardProps {
  label: string;
  value: number;
  color?: string;
  icon?: string;
}

function StatCard({ label, value, color = 'text-gray-900', icon }: StatCardProps) {
  return (
    <div className="bg-white rounded-lg shadow p-6 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-500">{label}</span>
        {icon && <span className="text-2xl">{icon}</span>}
      </div>
      <span className={`text-3xl font-bold ${color}`}>{value}</span>
    </div>
  );
}

export default function Dashboard() {
  const { devices, isLoading, connected } = useLiveDevices();

  const now = new Date();
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const { data: auditData } = useQuery({
    queryKey: ['audit-logs', 'dashboard'],
    queryFn: () => getAuditLogs({ limit: 50, from: since24h }),
  });

  const stats = useMemo(() => {
    const total = devices.length;
    const office = devices.filter(
      (d) => d.online && (d.network === 'office' || d.network === 'OFFICE')
    ).length;
    const homeBlocked = devices.filter(
      (d) =>
        d.online &&
        (d.network === 'home' || d.network === 'HOME') &&
        (d.internet === 'blocked' || d.internet === 'BLOCKED')
    ).length;
    const offline = devices.filter((d) => !d.online).length;
    return { total, office, homeBlocked, offline };
  }, [devices]);

  // Build chart data — hourly buckets for last 24h using audit logs
  const chartData = useMemo(() => {
    const hours: { time: string; home: number; office: number; offline: number }[] = [];
    for (let i = 23; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 60 * 60 * 1000);
      hours.push({
        time: `${d.getHours().toString().padStart(2, '0')}:00`,
        home: 0,
        office: 0,
        offline: 0,
      });
    }
    return hours;
  }, []);

  // Build timeline from audit logs
  const timelineEvents = useMemo(() => {
    const logs = auditData?.logs ?? [];
    return logs.slice(0, 20).map((log) => ({
      timestamp: log.timestamp,
      event: log.event,
      device: log.deviceName ?? '',
      detail:
        log.detail
          ? Object.entries(log.detail)
              .slice(0, 2)
              .map(([k, v]) => `${k}: ${String(v)}`)
              .join(', ')
          : '',
    }));
  }, [auditData]);

  const recentDevices = useMemo(
    () =>
      [...devices]
        .filter((d) => d.lastSeenAt)
        .sort(
          (a, b) =>
            new Date(b.lastSeenAt!).getTime() - new Date(a.lastSeenAt!).getTime()
        )
        .slice(0, 6),
    [devices]
  );

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="flex items-center gap-2 text-sm">
          <span
            className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-gray-400'}`}
          />
          <span className="text-gray-500">{connected ? 'Live' : 'Connecting...'}</span>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Devices" value={stats.total} icon="💻" />
        <StatCard
          label="Office / Online"
          value={stats.office}
          color="text-green-600"
          icon="🏢"
        />
        <StatCard
          label="Home / Blocked"
          value={stats.homeBlocked}
          color="text-red-600"
          icon="🏠"
        />
        <StatCard
          label="Offline"
          value={stats.offline}
          color="text-gray-500"
          icon="📴"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Chart */}
        <div className="lg:col-span-2 bg-white rounded-lg shadow p-6">
          <h2 className="text-base font-semibold text-gray-700 mb-4">
            Device States — Last 24h
          </h2>
          {isLoading ? (
            <div className="h-64 flex items-center justify-center text-gray-400">Loading...</div>
          ) : (
            <DeviceStateChart data={chartData} />
          )}
        </div>

        {/* Activity Timeline */}
        <div className="bg-white rounded-lg shadow p-6 overflow-y-auto max-h-80">
          <h2 className="text-base font-semibold text-gray-700 mb-4">Recent Activity</h2>
          <ActivityTimeline events={timelineEvents} />
        </div>
      </div>

      {/* Recent Devices */}
      {recentDevices.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-gray-700 mb-3">Recently Active Devices</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {recentDevices.map((d) => (
              <DeviceCard key={d.id} device={d} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
