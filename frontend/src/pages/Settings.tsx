import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/authStore';
import { generateEnrollmentToken } from '../api/devices';
import apiClient from '../api/client';
import type { AdminUser } from '../types';

type Tab = 'admins' | 'api-tokens' | 'organization' | 'updates';

interface InviteFormState {
  email: string;
  role: string;
}

export default function Settings() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('admins');
  const [enrollToken, setEnrollToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [inviteForm, setInviteForm] = useState<InviteFormState>({ email: '', role: 'ADMIN' });
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [orgName, setOrgName] = useState('');
  const [resetTarget, setResetTarget] = useState<{ id: string; email: string } | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [orgSaved, setOrgSaved] = useState(false);

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  const { data: admins = [], isLoading: adminsLoading } = useQuery<AdminUser[]>({
    queryKey: ['admins'],
    queryFn: async () => {
      const res = await apiClient.get<{ admins: AdminUser[] }>('/org/admins');
      return res.data.admins;
    },
    enabled: activeTab === 'admins',
  });

  const { data: org } = useQuery<{ id: string; name: string; slug: string }>({
    queryKey: ['org'],
    queryFn: async () => {
      const res = await apiClient.get<{ org: { id: string; name: string; slug: string } }>('/org');
      return res.data.org;
    },
    enabled: activeTab === 'organization',
  });

  React.useEffect(() => {
    if (org) setOrgName(org.name);
  }, [org]);

  const tokenMutation = useMutation({
    mutationFn: generateEnrollmentToken,
    onSuccess: (data) => {
      setEnrollToken(data.token);
      setShowToken(true);
    },
  });

  const inviteMutation = useMutation({
    mutationFn: async (data: InviteFormState & { password: string }) => {
      await apiClient.post('/org/admins', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admins'] });
      setInviteForm({ email: '', role: 'ADMIN' });
      setInvitePassword('');
      setInviteError('');
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setInviteError(axiosErr?.response?.data?.error ?? 'Failed to invite admin.');
    },
  });

  const removeAdminMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/org/admins/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admins'] });
    },
  });

  const changeRoleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => {
      await apiClient.put(`/org/admins/${id}/role`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admins'] });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ id, password }: { id: string; password: string }) => {
      await apiClient.patch(`/org/admins/${id}/password`, { newPassword: password });
    },
    onSuccess: () => {
      setResetTarget(null);
      setNewPassword('');
    },
  });

  const saveOrgMutation = useMutation({
    mutationFn: async (name: string) => {
      await apiClient.put('/org', { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org'] });
      setOrgSaved(true);
      setTimeout(() => setOrgSaved(false), 3000);
    },
  });

  const tabs: { id: Tab; label: string }[] = [
    { id: 'admins', label: 'Admin Users' },
    { id: 'api-tokens', label: 'API Tokens' },
    { id: 'organization', label: 'Organization' },
    { id: 'updates', label: 'Updates' },
  ];

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <div className="bg-white rounded-lg shadow p-6">
        {/* Tab bar */}
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

        {/* Admin Users */}
        {activeTab === 'admins' && (
          <div>
            <h2 className="text-base font-semibold text-gray-700 mb-4">Admin Users</h2>

            {adminsLoading ? (
              <p className="text-gray-400">Loading admins...</p>
            ) : (
              <table className="w-full border-collapse mb-6">
                <thead>
                  <tr>
                    <th className="text-left p-3 bg-gray-50 border-b font-medium text-gray-600 text-sm">Email</th>
                    <th className="text-left p-3 bg-gray-50 border-b font-medium text-gray-600 text-sm">Role</th>
                    <th className="text-left p-3 bg-gray-50 border-b font-medium text-gray-600 text-sm">Joined</th>
                    {isAdmin && (
                      <th className="text-left p-3 bg-gray-50 border-b font-medium text-gray-600 text-sm">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {admins.map((admin) => (
                    <tr key={admin.id} className="hover:bg-gray-50">
                      <td className="p-3 border-b text-sm">{admin.email}</td>
                      <td className="p-3 border-b">
                        {isAdmin && admin.id !== user?.id ? (
                          <select
                            value={admin.role}
                            onChange={(e) =>
                              changeRoleMutation.mutate({ id: admin.id, role: e.target.value })
                            }
                            className="border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="ADMIN">Admin</option>
                            <option value="SUPER_ADMIN">Super Admin</option>
                            <option value="VIEWER">Viewer</option>
                          </select>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                            {admin.role}
                          </span>
                        )}
                      </td>
                      <td className="p-3 border-b text-sm text-gray-600">
                        {new Date(admin.createdAt).toLocaleDateString()}
                      </td>
                      {isAdmin && (
                        <td className="p-3 border-b">
                          {admin.id !== user?.id && (
                            <div className="flex gap-2">
                              <button
                                onClick={() => setResetTarget({ id: admin.id, email: admin.email })}
                                className="bg-yellow-500 text-white px-3 py-1 rounded text-sm hover:bg-yellow-600"
                              >
                                Reset pwd
                              </button>
                              <button
                                onClick={() => removeAdminMutation.mutate(admin.id)}
                                disabled={removeAdminMutation.isPending}
                                className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700 disabled:opacity-50"
                              >
                                Remove
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Invite Form */}
            {isAdmin && (
              <div className="border rounded p-4 bg-gray-50">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Invite Admin</h3>
                <div className="flex gap-3 items-end flex-wrap">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Email</label>
                    <input
                      type="email"
                      value={inviteForm.email}
                      onChange={(e) => setInviteForm((prev) => ({ ...prev, email: e.target.value }))}
                      placeholder="admin@example.com"
                      className="border rounded px-3 py-2 w-64 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Role</label>
                    <select
                      value={inviteForm.role}
                      onChange={(e) => setInviteForm((prev) => ({ ...prev, role: e.target.value }))}
                      className="border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    >
                      <option value="ADMIN">Admin</option>
                      <option value="SUPER_ADMIN">Super Admin</option>
                      <option value="VIEWER">Viewer</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Initial Password</label>
                    <input
                      type="password"
                      value={invitePassword}
                      onChange={(e) => setInvitePassword(e.target.value)}
                      placeholder="Min 8 characters"
                      className="border rounded px-3 py-2 w-48 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                  <button
                    onClick={() => inviteMutation.mutate({ ...inviteForm, password: invitePassword })}
                    disabled={inviteMutation.isPending || !inviteForm.email || invitePassword.length < 8}
                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50 text-sm"
                  >
                    {inviteMutation.isPending ? 'Creating...' : 'Create Admin'}
                  </button>
                </div>
                {inviteError && (
                  <p className="text-red-600 text-sm mt-2">{inviteError}</p>
                )}
                {inviteMutation.isSuccess && (
                  <p className="text-green-600 text-sm mt-2">Invite sent successfully.</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* API Tokens */}
        {activeTab === 'api-tokens' && (
          <div>
            <h2 className="text-base font-semibold text-gray-700 mb-2">Enrollment Tokens</h2>
            <p className="text-sm text-gray-600 mb-4">
              Generate a one-time token to enroll new devices with the VPN ConConnect agent.
              The token is valid for a limited time and can only be used once.
            </p>
            <button
              onClick={() => tokenMutation.mutate()}
              disabled={tokenMutation.isPending}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {tokenMutation.isPending ? 'Generating...' : 'Generate Enrollment Token'}
            </button>

            {showToken && enrollToken && (
              <div className="mt-4 bg-gray-50 border rounded p-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Token (copy now — not shown again):</p>
                <div className="font-mono text-sm bg-white border rounded p-3 break-all mb-3">
                  {enrollToken}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => navigator.clipboard.writeText(enrollToken).catch(() => {})}
                    className="bg-white text-gray-700 border px-3 py-1.5 rounded text-sm hover:bg-gray-50"
                  >
                    Copy
                  </button>
                  <button
                    onClick={() => { setShowToken(false); setEnrollToken(''); }}
                    className="bg-white text-gray-700 border px-3 py-1.5 rounded text-sm hover:bg-gray-50"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Organization */}
        {activeTab === 'organization' && (
          <div>
            <h2 className="text-base font-semibold text-gray-700 mb-4">Organization Settings</h2>
            <div className="max-w-md space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Organization Name
                </label>
                <input
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  disabled={!isAdmin}
                  className="border rounded px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                />
              </div>
              {org && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
                  <input
                    type="text"
                    value={org.slug}
                    disabled
                    className="border rounded px-3 py-2 w-full bg-gray-50 text-gray-500 font-mono text-sm"
                  />
                  <p className="text-xs text-gray-400 mt-1">The slug cannot be changed.</p>
                </div>
              )}
              {isAdmin && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => saveOrgMutation.mutate(orgName)}
                    disabled={saveOrgMutation.isPending || !orgName.trim()}
                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saveOrgMutation.isPending ? 'Saving...' : 'Save Changes'}
                  </button>
                  {orgSaved && (
                    <span className="text-green-600 text-sm">Changes saved.</span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Updates */}
        {activeTab === 'updates' && (
          <div>
            <h2 className="text-base font-semibold text-gray-700 mb-4">Auto-Update Configuration</h2>
            <div className="bg-blue-50 border border-blue-200 rounded p-4 mb-6 text-sm text-blue-800">
              <p className="font-medium mb-1">How auto-updates work</p>
              <p>
                The VPN ConConnect agent periodically checks the update endpoint for the latest
                available version. When a new version is detected, the agent downloads and installs
                it automatically in the background. No user interaction is required.
              </p>
            </div>

            <div className="space-y-4 max-w-md">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Update Check Endpoint
                </label>
                <input
                  type="text"
                  readOnly
                  value={`${(import.meta.env.VITE_API_BASE_URL as string) || 'http://localhost:3000'}/api/updates/latest`}
                  className="border rounded px-3 py-2 w-full bg-gray-50 text-gray-600 font-mono text-sm"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Agents poll this endpoint to check for updates.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Update Check Interval
                </label>
                <p className="text-sm text-gray-600">
                  Devices check for updates every <strong>4 hours</strong> by default.
                  Contact support to adjust the interval for your organization.
                </p>
              </div>

              <div className="border rounded p-4 bg-gray-50">
                <p className="text-sm font-medium text-gray-700 mb-2">Update Channel</p>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="radio" name="channel" defaultChecked />
                    <span>Stable — recommended for production devices</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="radio" name="channel" />
                    <span>Beta — early access to new features</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Reset password modal */}
      {resetTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-96">
            <h3 className="text-base font-semibold mb-3">
              Reset password for {resetTarget.email}
            </h3>
            <input
              type="password"
              placeholder="New password (min 8 chars)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="border rounded px-3 py-2 w-full mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setResetTarget(null); setNewPassword(''); }}
                className="px-4 py-2 border rounded text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => resetPasswordMutation.mutate({ id: resetTarget.id, password: newPassword })}
                disabled={newPassword.length < 8 || resetPasswordMutation.isPending}
                className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {resetPasswordMutation.isPending ? 'Saving...' : 'Reset Password'}
              </button>
            </div>
            {resetPasswordMutation.isError && (
              <p className="text-red-600 text-sm mt-2">Failed to reset password.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
