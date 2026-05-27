import React from 'react';

interface TimelineEvent {
  timestamp: string;
  event: string;
  device: string;
  detail: string;
}

interface ActivityTimelineProps {
  events: TimelineEvent[];
}

const EVENT_COLORS: Record<string, string> = {
  DEVICE_ENROLLED: 'bg-blue-500',
  DEVICE_REVOKED: 'bg-red-500',
  POLICY_UPDATED: 'bg-purple-500',
  OVERRIDE_GRANTED: 'bg-yellow-500',
  OVERRIDE_EXPIRED: 'bg-gray-400',
  VPN_CONNECTED: 'bg-green-500',
  VPN_DISCONNECTED: 'bg-gray-400',
  STATUS_CHANGED: 'bg-orange-400',
  ADMIN_LOGIN: 'bg-indigo-500',
};

function formatTimestamp(ts: string): string {
  const date = new Date(ts);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ActivityTimeline({ events }: ActivityTimelineProps) {
  if (events.length === 0) {
    return <p className="text-sm text-gray-400 italic py-4 text-center">No recent activity.</p>;
  }

  return (
    <div className="space-y-3">
      {events.map((ev, idx) => {
        const dotColor = EVENT_COLORS[ev.event] ?? 'bg-gray-400';
        return (
          <div key={idx} className="flex items-start gap-3">
            <span className="text-xs text-gray-400 whitespace-nowrap mt-0.5 w-28 shrink-0">
              {formatTimestamp(ev.timestamp)}
            </span>
            <div className="flex items-center mt-1.5 shrink-0">
              <span className={`w-2 h-2 rounded-full ${dotColor}`} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-gray-700">{ev.event.replace(/_/g, ' ')}</span>
                {ev.device && (
                  <span className="text-xs text-gray-500">{ev.device}</span>
                )}
              </div>
              {ev.detail && (
                <p className="text-xs text-gray-400 mt-0.5 truncate">{ev.detail}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
