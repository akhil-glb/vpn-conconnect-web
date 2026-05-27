import React, { useState } from 'react';

interface SubnetListProps {
  subnets: string[];
  onChange: (subnets: string[]) => void;
  readonly?: boolean;
  placeholder?: string;
}

export default function SubnetList({
  subnets,
  onChange,
  readonly = false,
  placeholder = 'Add subnet or gateway...',
}: SubnetListProps) {
  const [inputValue, setInputValue] = useState('');

  const handleAdd = () => {
    const trimmed = inputValue.trim();
    if (trimmed && !subnets.includes(trimmed)) {
      onChange([...subnets, trimmed]);
      setInputValue('');
    }
  };

  const handleRemove = (subnet: string) => {
    onChange(subnets.filter((s) => s !== subnet));
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
        {subnets.length === 0 && (
          <p className="text-sm text-gray-400 italic">None configured.</p>
        )}
        {subnets.map((subnet) => (
          <div
            key={subnet}
            className="flex items-center justify-between bg-gray-50 border rounded px-3 py-1.5"
          >
            <span className="text-sm font-mono text-gray-700">{subnet}</span>
            {!readonly && (
              <button
                type="button"
                onClick={() => handleRemove(subnet)}
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
            placeholder={placeholder}
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
