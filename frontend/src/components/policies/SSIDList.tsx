import React, { useState } from 'react';

interface SSIDListProps {
  ssids: string[];
  onChange: (ssids: string[]) => void;
  readonly?: boolean;
}

export default function SSIDList({ ssids, onChange, readonly = false }: SSIDListProps) {
  const [inputValue, setInputValue] = useState('');

  const handleAdd = () => {
    const trimmed = inputValue.trim();
    if (trimmed && !ssids.includes(trimmed)) {
      onChange([...ssids, trimmed]);
      setInputValue('');
    }
  };

  const handleRemove = (ssid: string) => {
    onChange(ssids.filter((s) => s !== ssid));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div>
      <div className="space-y-1 mb-2">
        {ssids.length === 0 && (
          <p className="text-sm text-gray-400 italic">No SSIDs configured.</p>
        )}
        {ssids.map((ssid) => (
          <div
            key={ssid}
            className="flex items-center justify-between bg-gray-50 border rounded px-3 py-1.5"
          >
            <span className="text-sm font-mono text-gray-700">{ssid}</span>
            {!readonly && (
              <button
                type="button"
                onClick={() => handleRemove(ssid)}
                className="text-red-500 hover:text-red-700 text-xs ml-2"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
      {!readonly && (
        <div className="flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add SSID..."
            className="border rounded px-3 py-2 flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
          <button
            type="button"
            onClick={handleAdd}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}
