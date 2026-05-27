import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useLiveDevices } from '../hooks/useLiveDevices';
import { generateEnrollmentToken } from '../api/devices';
import DeviceTable from '../components/devices/DeviceTable';

export default function Devices() {
  const { devices, isLoading, connected } = useLiveDevices();
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [enrollToken, setEnrollToken] = useState('');

  const tokenMutation = useMutation({
    mutationFn: generateEnrollmentToken,
    onSuccess: (data) => {
      setEnrollToken(data.token);
      setShowTokenModal(true);
    },
  });

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Devices</h1>
          <div className="flex items-center gap-1.5 text-sm">
            <span
              className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-gray-400'}`}
            />
            <span className="text-gray-500">{connected ? 'Live' : 'Offline'}</span>
          </div>
        </div>
        <button
          onClick={() => tokenMutation.mutate()}
          disabled={tokenMutation.isPending}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {tokenMutation.isPending ? 'Generating...' : '+ Generate Enrollment Token'}
        </button>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-lg shadow p-12 text-center text-gray-400">
          Loading devices...
        </div>
      ) : (
        <DeviceTable devices={devices} />
      )}

      {/* Enrollment Token Modal */}
      {showTokenModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-lg w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">Enrollment Token</h3>
            <p className="text-sm text-gray-600 mb-4">
              Copy this token and use it to enroll a new device. It is valid for a limited time.
            </p>
            <div className="bg-gray-50 border rounded p-3 font-mono text-sm break-all mb-4">
              {enrollToken}
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(enrollToken).catch(() => {});
                }}
                className="bg-white text-gray-700 border px-4 py-2 rounded hover:bg-gray-50"
              >
                Copy
              </button>
              <button
                onClick={() => {
                  setShowTokenModal(false);
                  setEnrollToken('');
                }}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
