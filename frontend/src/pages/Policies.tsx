import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPolicies, deletePolicy } from '../api/policies';
import { getGroups } from '../api/groups';

function formatDate(ts: string): string {
  return new Date(ts).toLocaleString();
}

export default function Policies() {
  const queryClient = useQueryClient();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data: policies = [], isLoading } = useQuery({
    queryKey: ['policies'],
    queryFn: getPolicies,
  });

  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: getGroups,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePolicy(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policies'] });
      setConfirmDeleteId(null);
    },
  });

  const getGroupsForPolicy = (policyId: string) =>
    groups.filter((g) => g.policyId === policyId);

  const policyToDelete = confirmDeleteId
    ? policies.find((p) => p.id === confirmDeleteId)
    : null;
  const affectedGroups = confirmDeleteId ? getGroupsForPolicy(confirmDeleteId) : [];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Policies</h1>
        <Link
          to="/policies/new"
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          + Create Policy
        </Link>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-lg shadow p-12 text-center text-gray-400">
          Loading policies...
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="text-left p-3 bg-gray-50 border-b font-medium text-gray-600 text-sm">Name</th>
                <th className="text-left p-3 bg-gray-50 border-b font-medium text-gray-600 text-sm">Groups Using It</th>
                <th className="text-left p-3 bg-gray-50 border-b font-medium text-gray-600 text-sm">Version</th>
                <th className="text-left p-3 bg-gray-50 border-b font-medium text-gray-600 text-sm">Last Updated</th>
                <th className="text-left p-3 bg-gray-50 border-b font-medium text-gray-600 text-sm">Actions</th>
              </tr>
            </thead>
            <tbody>
              {policies.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-gray-400">
                    No policies yet. Create one to get started.
                  </td>
                </tr>
              )}
              {policies.map((policy) => {
                const policyGroups = getGroupsForPolicy(policy.id);
                return (
                  <tr key={policy.id} className="hover:bg-gray-50">
                    <td className="p-3 border-b font-medium text-gray-900">{policy.name}</td>
                    <td className="p-3 border-b">
                      {policyGroups.length === 0 ? (
                        <span className="text-gray-400 text-sm">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {policyGroups.map((g) => (
                            <span
                              key={g.id}
                              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800"
                            >
                              {g.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="p-3 border-b text-sm text-gray-600">v{policy.version}</td>
                    <td className="p-3 border-b text-sm text-gray-600">
                      {formatDate(policy.updatedAt)}
                    </td>
                    <td className="p-3 border-b">
                      <div className="flex gap-2">
                        <Link
                          to={`/policies/${policy.id}/edit`}
                          className="bg-white text-gray-700 border px-3 py-1 rounded text-sm hover:bg-gray-50"
                        >
                          Edit
                        </Link>
                        <button
                          onClick={() => setConfirmDeleteId(policy.id)}
                          className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDeleteId && policyToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">Delete Policy?</h3>
            <p className="text-gray-600 text-sm mb-2">
              Are you sure you want to delete <strong>{policyToDelete.name}</strong>?
            </p>
            {affectedGroups.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-3">
                <p className="text-sm text-yellow-800 font-medium mb-1">
                  Warning: {affectedGroups.length} group(s) use this policy:
                </p>
                <ul className="text-sm text-yellow-700 list-disc list-inside">
                  {affectedGroups.map((g) => (
                    <li key={g.id}>{g.name}</li>
                  ))}
                </ul>
              </div>
            )}
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
