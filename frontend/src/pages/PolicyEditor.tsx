import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPolicy, createPolicy, updatePolicy } from '../api/policies';
import SSIDList from '../components/policies/SSIDList';
import SubnetList from '../components/policies/SubnetList';
import PasswordInput from '../components/PasswordInput';
import { logCopyEvent } from '../api/audit';
import type { VpnProfile, VpnTunnelType, VpnAuthMethod, VpnEncryptionLevel } from '../types';

const AUTH_METHODS: Record<VpnTunnelType, { value: VpnAuthMethod; label: string }[]> = {
  L2TP:      [{ value: 'MSChapV2', label: 'MS-CHAPv2' }, { value: 'Chap', label: 'CHAP' }, { value: 'Pap', label: 'PAP' }, { value: 'EAP', label: 'EAP' }],
  IKEv2:     [{ value: 'EAP', label: 'EAP (User)' }, { value: 'MachineCertificate', label: 'Machine Certificate' }],
  PPTP:      [{ value: 'MSChapV2', label: 'MS-CHAPv2' }, { value: 'Chap', label: 'CHAP' }, { value: 'Pap', label: 'PAP' }],
  SSTP:      [{ value: 'MSChapV2', label: 'MS-CHAPv2' }, { value: 'Chap', label: 'CHAP' }, { value: 'EAP', label: 'EAP' }],
  Automatic: [{ value: 'MSChapV2', label: 'MS-CHAPv2' }, { value: 'EAP', label: 'EAP' }],
};

const ENCRYPTION_LEVELS: { value: VpnEncryptionLevel; label: string }[] = [
  { value: 'NoEncryption', label: 'No Encryption' },
  { value: 'Optional', label: 'Optional' },
  { value: 'Required', label: 'Required' },
  { value: 'Maximum', label: 'Maximum' },
  { value: 'Custom', label: 'Custom' },
];

const INITIAL_VPN_PROFILE = {
  name: '', displayName: '', serverAddress: '',
  tunnelType: 'L2TP' as VpnTunnelType,
  l2tpPsk: '',
  authenticationMethod: 'MSChapV2' as VpnAuthMethod,
  encryptionLevel: 'Required' as VpnEncryptionLevel,
  rememberCredential: true,
};

type Tab = 'home' | 'applications' | 'behavior' | 'vpn';

interface PolicyFormState {
  name: string;
  homeSSIDs: string[];
  homeGateways: string[];
  homeSubnets: string[];
  blockOnHome: boolean;
  blockOnUnknown: boolean;
  allowOverride: boolean;
  overrideDurationMinutes: number;
  allowedApps: string[];
  blockedApps: string[];
  vpnProfiles: VpnProfile[];
}

const DEFAULT_FORM: PolicyFormState = {
  name: '',
  homeSSIDs: [],
  homeGateways: [],
  homeSubnets: [],
  blockOnHome: true,
  blockOnUnknown: true,
  allowOverride: false,
  overrideDurationMinutes: 60,
  allowedApps: [],
  blockedApps: [],
  vpnProfiles: [],
};

export default function PolicyEditor() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [form, setForm] = useState<PolicyFormState>(DEFAULT_FORM);
  const [newAllowedApp, setNewAllowedApp] = useState('');
  const [newBlockedApp, setNewBlockedApp] = useState('');
  const [newVpnProfile, setNewVpnProfile] = useState(INITIAL_VPN_PROFILE);
  const [adminPin, setAdminPin] = useState('');
  const [adminPinConfirm, setAdminPinConfirm] = useState('');
  const [clearPin, setClearPin] = useState(false);
  const [error, setError] = useState('');

  const { data: existingPolicy } = useQuery({
    queryKey: ['policy', id],
    queryFn: () => getPolicy(id!),
    enabled: isEdit,
  });

  useEffect(() => {
    if (existingPolicy) {
      setForm({
        name: existingPolicy.name,
        homeSSIDs: existingPolicy.homeSSIDs,
        homeGateways: existingPolicy.homeGateways,
        homeSubnets: existingPolicy.homeSubnets,
        blockOnHome: existingPolicy.blockOnHome,
        blockOnUnknown: existingPolicy.blockOnUnknown,
        allowOverride: existingPolicy.allowOverride,
        overrideDurationMinutes: existingPolicy.overrideDurationMinutes,
        allowedApps: existingPolicy.allowedApps,
        blockedApps: existingPolicy.blockedApps,
        vpnProfiles: existingPolicy.vpnProfiles,
      });
    }
  }, [existingPolicy]);

  const saveMutation = useMutation({
    mutationFn: () => {
      // Resolve admin PIN payload
      let resolvedAdminPin: string | null | undefined;
      if (clearPin) {
        resolvedAdminPin = null;             // explicitly remove PIN
      } else if (adminPin.trim()) {
        if (adminPin.length < 4) throw new Error('Admin PIN must be at least 4 characters.');
        if (adminPin !== adminPinConfirm) throw new Error('Admin PINs do not match.');
        resolvedAdminPin = adminPin;         // set new PIN
      }
      // resolvedAdminPin === undefined → don't change existing PIN

      const payload = { ...form, adminPin: resolvedAdminPin };
      return isEdit ? updatePolicy(id!, payload) : createPolicy(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policies'] });
      navigate('/policies');
    },
    onError: (err: unknown) => {
      if (err instanceof Error) { setError(err.message); return; }
      const axiosErr = err as { response?: { data?: { error?: string; message?: string } } };
      setError(
        axiosErr?.response?.data?.error ??
        axiosErr?.response?.data?.message ??
        'Failed to save policy.'
      );
    },
  });

  const setField = <K extends keyof PolicyFormState>(key: K, value: PolicyFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'home', label: 'Home Network Rules' },
    { id: 'applications', label: 'Applications' },
    { id: 'behavior', label: 'Behavior' },
    { id: 'vpn', label: 'VPN Profiles' },
  ];

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">
        {isEdit ? 'Edit Policy' : 'New Policy'}
      </h1>

      <div className="bg-white rounded-lg shadow p-6">
        {/* Policy Name */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">Policy Name</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setField('name', e.target.value)}
            placeholder="e.g. Standard Employee Policy"
            className="border rounded px-3 py-2 w-full max-w-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Tabs */}
        <div className="border-b mb-6">
          <nav className="flex gap-0">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Home Network Rules */}
        {activeTab === 'home' && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Home SSIDs
              </label>
              <p className="text-xs text-gray-500 mb-2">
                Wi-Fi network names that are considered "home" networks.
              </p>
              <SSIDList ssids={form.homeSSIDs} onChange={(v) => setField('homeSSIDs', v)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Home Gateways
              </label>
              <p className="text-xs text-gray-500 mb-2">
                Gateway IP addresses that identify home networks (e.g. 192.168.1.1).
              </p>
              <SubnetList
                subnets={form.homeGateways}
                onChange={(v) => setField('homeGateways', v)}
                placeholder="Add gateway IP..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Home Subnets
              </label>
              <p className="text-xs text-gray-500 mb-2">
                Subnet ranges that identify home networks (e.g. 192.168.1.0/24).
              </p>
              <SubnetList
                subnets={form.homeSubnets}
                onChange={(v) => setField('homeSubnets', v)}
                placeholder="Add subnet (CIDR)..."
              />
            </div>
          </div>
        )}

        {/* Applications */}
        {activeTab === 'applications' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Always Allow */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Always Allow</h3>
              <div className="space-y-1 mb-2">
                {form.allowedApps.length === 0 && (
                  <p className="text-sm text-gray-400 italic">No apps in allow list.</p>
                )}
                {form.allowedApps.map((app) => (
                  <div
                    key={app}
                    className="flex items-center justify-between bg-green-50 border border-green-200 rounded px-3 py-1.5"
                  >
                    <span className="text-sm font-mono text-gray-700 truncate">{app}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setField(
                          'allowedApps',
                          form.allowedApps.filter((a) => a !== app)
                        )
                      }
                      className="text-red-500 hover:text-red-700 text-xs ml-2 shrink-0"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newAllowedApp}
                  onChange={(e) => setNewAllowedApp(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const t = newAllowedApp.trim();
                      if (t && !form.allowedApps.includes(t)) {
                        setField('allowedApps', [...form.allowedApps, t]);
                        setNewAllowedApp('');
                      }
                    }
                  }}
                  placeholder="App path or bundle ID..."
                  className="border rounded px-3 py-2 flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
                <button
                  type="button"
                  onClick={() => {
                    const t = newAllowedApp.trim();
                    if (t && !form.allowedApps.includes(t)) {
                      setField('allowedApps', [...form.allowedApps, t]);
                      setNewAllowedApp('');
                    }
                  }}
                  disabled={!newAllowedApp.trim()}
                  className="bg-green-600 text-white px-3 py-2 rounded hover:bg-green-700 text-sm disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </div>

            {/* Always Block */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Always Block</h3>
              <div className="space-y-1 mb-2">
                {form.blockedApps.length === 0 && (
                  <p className="text-sm text-gray-400 italic">No apps in block list.</p>
                )}
                {form.blockedApps.map((app) => (
                  <div
                    key={app}
                    className="flex items-center justify-between bg-red-50 border border-red-200 rounded px-3 py-1.5"
                  >
                    <span className="text-sm font-mono text-gray-700 truncate">{app}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setField(
                          'blockedApps',
                          form.blockedApps.filter((a) => a !== app)
                        )
                      }
                      className="text-red-500 hover:text-red-700 text-xs ml-2 shrink-0"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newBlockedApp}
                  onChange={(e) => setNewBlockedApp(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const t = newBlockedApp.trim();
                      if (t && !form.blockedApps.includes(t)) {
                        setField('blockedApps', [...form.blockedApps, t]);
                        setNewBlockedApp('');
                      }
                    }
                  }}
                  placeholder="App path or bundle ID..."
                  className="border rounded px-3 py-2 flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
                <button
                  type="button"
                  onClick={() => {
                    const t = newBlockedApp.trim();
                    if (t && !form.blockedApps.includes(t)) {
                      setField('blockedApps', [...form.blockedApps, t]);
                      setNewBlockedApp('');
                    }
                  }}
                  disabled={!newBlockedApp.trim()}
                  className="bg-red-600 text-white px-3 py-2 rounded hover:bg-red-700 text-sm disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Behavior */}
        {activeTab === 'behavior' && (
          <div className="space-y-5">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.blockOnHome}
                onChange={(e) => setField('blockOnHome', e.target.checked)}
                className="mt-0.5"
              />
              <div>
                <span className="text-sm font-medium text-gray-700">Block on home network</span>
                <p className="text-xs text-gray-500 mt-0.5">
                  Internet access will be blocked when the device is detected on a home network.
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.blockOnUnknown}
                onChange={(e) => setField('blockOnUnknown', e.target.checked)}
                className="mt-0.5"
              />
              <div>
                <span className="text-sm font-medium text-gray-700">Block on unknown network</span>
                <p className="text-xs text-gray-500 mt-0.5">
                  Internet access will be blocked on networks not recognized as office or home.
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.allowOverride}
                onChange={(e) => setField('allowOverride', e.target.checked)}
                className="mt-0.5"
              />
              <div>
                <span className="text-sm font-medium text-gray-700">Allow override</span>
                <p className="text-xs text-gray-500 mt-0.5">
                  Administrators can grant temporary access overrides to individual devices.
                </p>
              </div>
            </label>

            {form.allowOverride && (
              <div className="ml-7">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Default override duration (minutes)
                </label>
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={form.overrideDurationMinutes}
                  onChange={(e) =>
                    setField('overrideDurationMinutes', Number(e.target.value))
                  }
                  className="border rounded px-3 py-2 w-32 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            {/* Admin PIN */}
            <div className="border-t pt-5 mt-2">
              <h3 className="text-sm font-semibold text-gray-700 mb-1">Tray Admin PIN</h3>
              <p className="text-xs text-gray-500 mb-3">
                Users must enter this PIN in the tray app to access Settings, Manual Override,
                and other admin features. Leave blank to keep the existing PIN.
                {isEdit && existingPolicy?.adminPinHash && (
                  <span className="ml-1 text-blue-600 font-medium">A PIN is currently set.</span>
                )}
                {isEdit && !existingPolicy?.adminPinHash && (
                  <span className="ml-1 text-gray-400">(No PIN set — default PIN is in use.)</span>
                )}
              </p>
              <div className={`space-y-3 ${clearPin ? 'opacity-40 pointer-events-none' : ''}`}>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">New PIN (min 4 characters)</label>
                  <PasswordInput
                    value={adminPin}
                    onChange={(e) => setAdminPin(e.target.value)}
                    placeholder="Enter new PIN…"
                    autoComplete="new-password"
                    className="border rounded px-3 py-2 w-64 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    onCopy={() => logCopyEvent('admin_pin')}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Confirm PIN</label>
                  <PasswordInput
                    value={adminPinConfirm}
                    onChange={(e) => setAdminPinConfirm(e.target.value)}
                    placeholder="Confirm PIN…"
                    autoComplete="new-password"
                    className="border rounded px-3 py-2 w-64 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    onCopy={() => logCopyEvent('admin_pin_confirm')}
                  />
                </div>
              </div>
              {isEdit && existingPolicy?.adminPinHash && (
                <label className="flex items-center gap-2 mt-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={clearPin}
                    onChange={(e) => {
                      setClearPin(e.target.checked);
                      if (e.target.checked) { setAdminPin(''); setAdminPinConfirm(''); }
                    }}
                  />
                  <span className="text-sm text-red-600">Remove PIN (revert to default)</span>
                </label>
              )}
            </div>
          </div>
        )}

        {/* VPN Profiles */}
        {activeTab === 'vpn' && (
          <div>
            <div className="space-y-2 mb-4">
              {form.vpnProfiles.length === 0 && (
                <p className="text-sm text-gray-400 italic">No VPN profiles configured.</p>
              )}
              {form.vpnProfiles.map((profile, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 bg-gray-50 border rounded p-3"
                >
                  <input
                    type="radio"
                    name="defaultVpn"
                    checked={profile.isDefault}
                    onChange={() =>
                      setField(
                        'vpnProfiles',
                        form.vpnProfiles.map((p, i) => ({ ...p, isDefault: i === idx }))
                      )
                    }
                    title="Set as default"
                  />
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-500">Internal name</label>
                      <p className="text-sm font-mono">{profile.name}</p>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Display name</label>
                      <p className="text-sm">{profile.displayName}</p>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Server</label>
                      <p className="text-sm font-mono">{profile.serverAddress}</p>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Tunnel · Auth</label>
                      <p className="text-sm">{profile.tunnelType} · {profile.authenticationMethod}</p>
                    </div>
                  </div>
                  {profile.isDefault && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                      Default
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setField(
                        'vpnProfiles',
                        form.vpnProfiles.filter((_, i) => i !== idx)
                      )
                    }
                    className="text-red-500 hover:text-red-700 text-sm"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <div className="border rounded p-4 bg-gray-50">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Add VPN Profile</h3>
              <div className="space-y-3">
                {/* Row 1: Internal name + Display name */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Internal name <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={newVpnProfile.name}
                      onChange={(e) => setNewVpnProfile((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="Office-vpn"
                      className="border rounded px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Display name <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={newVpnProfile.displayName}
                      onChange={(e) => setNewVpnProfile((prev) => ({ ...prev, displayName: e.target.value }))}
                      placeholder="Office VPN"
                      className="border rounded px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                </div>

                {/* Row 2: Server address */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Server Address <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={newVpnProfile.serverAddress}
                    onChange={(e) => setNewVpnProfile((prev) => ({ ...prev, serverAddress: e.target.value }))}
                    placeholder="16.1.8.16 or vpn.company.com"
                    className="border rounded px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>

                {/* Row 3: Tunnel type + Encryption level */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Tunnel Type</label>
                    <select
                      value={newVpnProfile.tunnelType}
                      onChange={(e) => {
                        const tt = e.target.value as VpnTunnelType;
                        setNewVpnProfile((prev) => ({
                          ...prev,
                          tunnelType: tt,
                          authenticationMethod: AUTH_METHODS[tt][0].value,
                        }));
                      }}
                      className="border rounded px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    >
                      {(['L2TP', 'IKEv2', 'PPTP', 'SSTP', 'Automatic'] as VpnTunnelType[]).map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Encryption Level</label>
                    <select
                      value={newVpnProfile.encryptionLevel}
                      onChange={(e) => setNewVpnProfile((prev) => ({ ...prev, encryptionLevel: e.target.value as VpnEncryptionLevel }))}
                      className="border rounded px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    >
                      {ENCRYPTION_LEVELS.map((el) => (
                        <option key={el.value} value={el.value}>{el.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Row 4: L2TP PSK (conditional) */}
                {newVpnProfile.tunnelType === 'L2TP' && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">L2TP Pre-Shared Key</label>
                    <PasswordInput
                      value={newVpnProfile.l2tpPsk}
                      onChange={(e) => setNewVpnProfile((prev) => ({ ...prev, l2tpPsk: e.target.value }))}
                      placeholder="Pre-shared key for IPSec…"
                      autoComplete="new-password"
                      className="border rounded px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                )}

                {/* Row 5: Auth method + Remember credential */}
                <div className="grid grid-cols-2 gap-3 items-end">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Authentication Method</label>
                    <select
                      value={newVpnProfile.authenticationMethod}
                      onChange={(e) => setNewVpnProfile((prev) => ({ ...prev, authenticationMethod: e.target.value as VpnAuthMethod }))}
                      className="border rounded px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    >
                      {AUTH_METHODS[newVpnProfile.tunnelType].map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                  <label className="flex items-center gap-2 text-sm cursor-pointer pb-2">
                    <input
                      type="checkbox"
                      checked={newVpnProfile.rememberCredential}
                      onChange={(e) => setNewVpnProfile((prev) => ({ ...prev, rememberCredential: e.target.checked }))}
                    />
                    Remember credential
                  </label>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  const n = newVpnProfile.name.trim();
                  const d = newVpnProfile.displayName.trim();
                  const s = newVpnProfile.serverAddress.trim();
                  if (n && d && s) {
                    const isDefault = form.vpnProfiles.length === 0;
                    setField('vpnProfiles', [
                      ...form.vpnProfiles,
                      {
                        name: n,
                        displayName: d,
                        isDefault,
                        serverAddress: s,
                        tunnelType: newVpnProfile.tunnelType,
                        l2tpPsk: newVpnProfile.l2tpPsk.trim() || undefined,
                        authenticationMethod: newVpnProfile.authenticationMethod,
                        encryptionLevel: newVpnProfile.encryptionLevel,
                        rememberCredential: newVpnProfile.rememberCredential,
                      },
                    ]);
                    setNewVpnProfile(INITIAL_VPN_PROFILE);
                  }
                }}
                disabled={!newVpnProfile.name.trim() || !newVpnProfile.displayName.trim() || !newVpnProfile.serverAddress.trim()}
                className="mt-4 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm disabled:opacity-50"
              >
                Add Profile
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 text-red-700 rounded px-3 py-2 text-sm">
            {error}
          </div>
        )}

        {/* Save */}
        <div className="flex gap-3 mt-8 pt-6 border-t">
          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !form.name.trim()}
            className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50 font-medium"
          >
            {saveMutation.isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Policy'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/policies')}
            className="bg-white text-gray-700 border px-4 py-2 rounded hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
