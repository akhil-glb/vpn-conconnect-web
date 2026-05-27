import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface DataPoint {
  time: string;
  home: number;
  office: number;
  offline: number;
}

interface DeviceStateChartProps {
  data: DataPoint[];
}

export default function DeviceStateChart({ data }: DeviceStateChartProps) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="time"
          tick={{ fontSize: 11, fill: '#6b7280' }}
          tickLine={false}
          axisLine={{ stroke: '#e5e7eb' }}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#6b7280' }}
          tickLine={false}
          axisLine={false}
          width={30}
        />
        <Tooltip
          contentStyle={{
            border: '1px solid #e5e7eb',
            borderRadius: '6px',
            fontSize: '12px',
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
        />
        <Line
          type="monotone"
          dataKey="office"
          stroke="#22c55e"
          strokeWidth={2}
          dot={false}
          name="Office"
        />
        <Line
          type="monotone"
          dataKey="home"
          stroke="#ef4444"
          strokeWidth={2}
          dot={false}
          name="Home"
        />
        <Line
          type="monotone"
          dataKey="offline"
          stroke="#9ca3af"
          strokeWidth={2}
          dot={false}
          name="Offline"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
