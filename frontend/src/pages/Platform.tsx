import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import { useAuthStore } from '../stores/authStore';

interface PlatformOrg {
  id: string;
  name: string;
  slug: string;
  plan: string;
  createdAt: string;
  suspendedAt: string | null;
  _count: { devices: number; admins: number };
}

interface PlatformStats {
  totalOrgs: number;
  totalDevices: number;
  onlineDevices: number;
  totalAdmins: number;
}

async function getPlatformStats(): Promise<PlatformStats> {
  const res = await apiClient.get<PlatformStats>('/platform/stats');
  return res.data;
}

async function getPlatformOrgs(): Promise<{ orgs: PlatformOrg[] }> {
  const res = await apiClient.get<{ orgs: PlatformOrg[] }>('/platform/orgs');
  return res.data;
}

async function createOrg(data: { name: string; slug: string; plan: string }): Promise<{ org: PlatformOrg }> {
  const res = await apiClient.post<{ org: PlatformOrg }>('/platform/orgs', data);
  return res.data;
}

async function impersonateOrg(orgId: string): Promise<{ token: string }> {
  const res = await apiClient.post<{ token: string }>(`/platform/orgs/${orgId}/impersonate`);
  return res.data;
}

function parseJwtPayload(token: string): { userId: string; role: string; orgId: string } {
  const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(base64)) as { userId: string; role: string; orgId: string };
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

function StatCard({ label, value, color = 'text-gray-900' }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

interface CreateOrgModalProps {
  onClose: () => void;
  onCreated: () => void;
}

function CreateOrgModal({ onClose, onCreated }: CreateOrgModalProps) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManual, setSlugManual] = useState(false);
  const [plan, setPlan] = useState('FREE');
  const [error, setError] = useState('');

  const handleNameChange = (v: string) => {
    setName(v);
    if (!slugManual) setSlug(toSlug(v));
  };

  const handleSlugChange = (v: string) => {
    setSlug(v.toLowerCase().replace(/[^a-z0-9-]/g, ''));
    setSlugManual(true);
  };

  const mutation = useMutation({
    mutationFn: createOrg,
    onSuccess: () => {
      onCreated();
      onClose();
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e?.response?.data?.error ?? 'Failed to create organization');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('Name is required'); return; }
    if (!slug.trim()) { setError('Slug is required'); return; }
    mutation.mutate({ name: name.trim(), slug: slug.trim(), plan });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl font-bold"
        >
          ×
        </button>

        <h2 className="text-lg font-bold text-gray-900 mb-5">New Organization</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              autoFocus
              placeholder="Acme Corp"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Slug
              <span className="ml-1 text-xs text-gray-400 font-normal">(lowercase, a-z 0-9 -)</span>
            </label>
            <input
              type="text"
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              placeholder="acme-corp"
              className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Plan</label>
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="FREE">Free</option>
              <option value="PRO">Pro</option>
              <option value="BUSINESS">Business</option>
              <option value="ENTERPRISE">Enterprise</option>
            </select>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 rounded-lg border hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium transition-colors"
            >
              {mutation.isPending ? 'Creating...' : 'Create Organization'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Platform() {
  const [showCreate, setShowCreate] = useState(false);
  const [enteringOrgId, setEnteringOrgId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user, impersonate } = useAuthStore();

  const impersonateMutation = useMutation({
    mutationFn: (org: PlatformOrg) => impersonateOrg(org.id).then((r) => ({ token: r.token, org })),
    onSuccess: ({ token, org }) => {
      const payload = parseJwtPayload(token);
      impersonate(
        token,
        { id: payload.userId, email: user?.email ?? '', role: 'ADMIN', orgId: payload.orgId },
        org.name
      );
      navigate('/dashboard');
    },
    onSettled: () => setEnteringOrgId(null),
  });

  const { data: stats } = useQuery({ queryKey: ['platform-stats'], queryFn: getPlatformStats });
  const { data: orgsData, isLoading } = useQuery({ queryKey: ['platform-orgs'], queryFn: getPlatformOrgs });

  const orgs = orgsData?.orgs ?? [];

  const handleCreated = () => {
    queryClient.invalidateQueries({ queryKey: ['platform-orgs'] });
    queryClient.invalidateQueries({ queryKey: ['platform-stats'] });
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Platform Overview</h1>
          <p className="text-sm text-gray-500 mt-1">Super Admin — all organizations</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + New Organization
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard label="Organizations" value={stats.totalOrgs} />
          <StatCard label="Total Devices" value={stats.totalDevices} />
          <StatCard label="Online Devices" value={stats.onlineDevices} color="text-green-600" />
          <StatCard label="Total Admins" value={stats.totalAdmins} />
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="text-base font-semibold text-gray-700">Organizations</h2>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : orgs.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            No organizations yet. Use the button above to create the first one.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
              <tr>
                <th className="px-6 py-3 text-left">Name</th>
                <th className="px-6 py-3 text-left">Slug</th>
                <th className="px-6 py-3 text-left">Plan</th>
                <th className="px-6 py-3 text-right">Devices</th>
                <th className="px-6 py-3 text-right">Admins</th>
                <th className="px-6 py-3 text-left">Status</th>
                <th className="px-6 py-3 text-left">Created</th>
                <th className="px-6 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orgs.map((org) => (
                <tr key={org.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-900">{org.name}</td>
                  <td className="px-6 py-4 text-gray-500 font-mono text-xs">{org.slug}</td>
                  <td className="px-6 py-4">
                    <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-medium">
                      {org.plan}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">{org._count.devices}</td>
                  <td className="px-6 py-4 text-right">{org._count.admins}</td>
                  <td className="px-6 py-4">
                    {org.suspendedAt ? (
                      <span className="text-red-600 text-xs font-medium">Suspended</span>
                    ) : (
                      <span className="text-green-600 text-xs font-medium">Active</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-gray-500">
                    {new Date(org.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => {
                        setEnteringOrgId(org.id);
                        impersonateMutation.mutate(org);
                      }}
                      disabled={enteringOrgId === org.id}
                      className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium transition-colors whitespace-nowrap"
                    >
                      {enteringOrgId === org.id ? 'Entering...' : 'Enter Dashboard →'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <CreateOrgModal
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
