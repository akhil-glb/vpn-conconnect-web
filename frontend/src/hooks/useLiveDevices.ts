import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useWebSocket } from './useWebSocket';
import { getDevices } from '../api/devices';
import type { Device } from '../types';

interface DeviceStatusMessage {
  type: 'device_status';
  deviceId: string;
  network?: string;
  internet?: string;
  vpn?: string;
  vpnProfile?: string;
  ssid?: string;
  localIP?: string;
  gatewayIP?: string;
  online?: boolean;
}

interface DeviceOfflineMessage {
  type: 'device_offline';
  deviceId: string;
}

type WsMessage = DeviceStatusMessage | DeviceOfflineMessage;

const WS_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';
const WS_URL = WS_BASE.replace(/^http/, 'ws').replace(/^https/, 'wss') + '/ws/dashboard';

interface UseLiveDevicesResult {
  devices: Device[];
  isLoading: boolean;
  connected: boolean;
}

export function useLiveDevices(): UseLiveDevicesResult {
  const [liveOverrides, setLiveOverrides] = useState<Record<string, Partial<Device>>>({});

  const { data: baseDevices = [], isLoading } = useQuery({
    queryKey: ['devices'],
    queryFn: getDevices,
  });

  const handleMessage = useCallback((raw: unknown) => {
    const msg = raw as WsMessage;
    if (msg.type === 'device_status') {
      setLiveOverrides((prev) => ({
        ...prev,
        [msg.deviceId]: {
          ...prev[msg.deviceId],
          online: msg.online ?? true,
          network: msg.network,
          internet: msg.internet,
          vpn: msg.vpn,
          vpnProfile: msg.vpnProfile,
          ssid: msg.ssid,
          localIP: msg.localIP,
          gatewayIP: msg.gatewayIP,
        },
      }));
    } else if (msg.type === 'device_offline') {
      setLiveOverrides((prev) => ({
        ...prev,
        [msg.deviceId]: {
          ...prev[msg.deviceId],
          online: false,
        },
      }));
    }
  }, []);

  const { connected } = useWebSocket(WS_URL, handleMessage);

  const devices: Device[] = baseDevices.map((d) => {
    const override = liveOverrides[d.id];
    return override ? { ...d, ...override } : d;
  });

  return { devices, isLoading, connected };
}
