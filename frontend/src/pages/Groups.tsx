import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getGroups, createGroup, updateGroup, deleteGroup } from '../api/groups';
import { getDevices } from '../api/devices';
import { getPolicies } from '../api/policies';
import type { Group } from '../types';

interface GroupModalProps {
  group?: Group;
  policyOptions: { id: string; name: string }[];
  onClose: () => void;
  onSave: (data: { name: string; policyId: string }) => void;
  saving: boolean;
}

function GroupModal({ group, policyOptions, onClose, onSave, saving }: GroupModalProps) {
  const [name, setName] = useState(group?.name ?? '');
  const [policyId, setPolicyId] = useState(group?.policyId ?? '');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm w-full mx-4">
        <h3 className="text-lg font-semibold mb-4">{group ? 'Edit Group' : 'Create Group'}</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Group Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Engineering Team"
              className="border rounded px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Policy</label>
            <select
              value={policyId}
              onChange={(e) => setPolicyId(e.target.value)}
              className="border rounded px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Select policy —</option>
              {policyOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-3 justify-end mt-5">
          <button
            onClick={onClose}
            className="bg-white text-gray-700 border px-4 py-2 rounded hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave({ name, policyId })}
            disabled={saving || !name.trim() || !policyId}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Groups() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | undefined>();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ['groups'],
    queryFn: getGroups,
  });

  const { data: policies = [] } = useQuery({
    queryKey: ['policies'],
    queryFn: getPolicies,
  });

  const { data: devices = [] } = useQuery({
    queryKey: ['devices'],
    queryFn: getDevices,
  });

  const createMutation = useMutation({
    mutationFn: createGroup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      setShowModal(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name: string; policyId: string } }) =>
      updateGroup(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      setShowModal(false);
      setEditingGroup(undefined);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteGroup(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      setConfirmDeleteId(null);
    },
  });

  const handleSave = (data: { name: string; policyId: string }) => {
    if (editingGroup) {
      updateMutation.mutate({ id: editingGroup.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const policyOptions = policies.map((p) => ({ id: p.id, name: p.name }));
  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Groups</h1>
        <button
          onClick={() => { setEditingGroup(undefined); setShowModal(true); }}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          + Create Group
        </button>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-lg shadow p-12 text-center text-gray-400">
          Loading groups...
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="text-left p-3 bg-gray-50 border-b font-medium text-gray-600 text-sm">Group Name</th>
                <th className="text-left p-3 bg-gray-50 border-b font-medium text-gray-600 text-sm">Policy</th>
                <th className="text-left p-3 bg-gray-50 border-b font-medium text-gray-600 text-sm">Devices</th>
                <th className="text-left p-3 bg-gray-50 border-b font-medium text-gray-600 text-sm">Actions</th>
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-gray-400">
                    No groups yet. Create one to organize devices.
                  </td>
                </tr>
              )}
              {groups.map((group) => {
                const groupDevices = devices.filter((d) => d.groupId === group.id);
                const isExpanded = expandedGroupId === group.id;
                return (
                  <React.Fragment key={group.id}>
                    <tr className="hover:bg-gray-50">
                      <td className="p-3 border-b font-medium text-gray-900">{group.name}</td>
                      <td className="p-3 border-b text-sm text-gray-600">
                        {group.policyName ?? policies.find((p) => p.id === group.policyId)?.name ?? '—'}
                      </td>
                      <td className="p-3 border-b">
                        <button
                          onClick={() => setExpandedGroupId(isExpanded ? null : group.id)}
                          className="text-sm text-blue-600 hover:underline"
                        >
                          {groupDevices.length} device{groupDevices.length !== 1 ? 's' : ''}
                          {groupDevices.length > 0 && (
                            <span className="ml-1">{isExpanded ? '▲' : '▼'}</span>
                          )}
                        </button>
                      </td>
                      <td className="p-3 border-b">
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setEditingGroup(group); setShowModal(true); }}
                            className="bg-white text-gray-700 border px-3 py-1 rounded text-sm hover:bg-gray-50"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(group.id)}
                            className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && groupDevices.length > 0 && (
                      <tr>
                        <td colSpan={4} className="bg-gray-50 px-6 py-3 border-b">
                          <div className="flex flex-wrap gap-2">
                            {groupDevices.map((d) => (
                              <span
                                key={d.id}
                                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-white border text-gray-700"
                              >
                                {d.name}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <GroupModal
          group={editingGroup}
          policyOptions={policyOptions}
          onClose={() => { setShowModal(false); setEditingGroup(undefined); }}
          onSave={handleSave}
          saving={isSaving}
        />
      )}

      {/* Delete Confirmation */}
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">Delete Group?</h3>
            <p className="text-gray-600 text-sm mb-4">
              This will delete the group. Devices in the group will be unassigned.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="bg-white text-gray-700 border px-4 py-2 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(confirmDeleteId)}
                disabled={deleteMutation.isPending}
                className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
