'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface BalanceData {
  date: string;
  balance: number;
}

interface BalanceLineChartProps {
  data: BalanceData[];
}

export function BalanceLineChart({ data }: BalanceLineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart
        data={data}
        margin={{
          top: 20,
          right: 30,
          left: 0,
          bottom: 20,
        }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="date"
          stroke="#6b7280"
          style={{ fontSize: '12px' }}
        />
        <YAxis
          stroke="#6b7280"
          style={{ fontSize: '12px' }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
          }}
          formatter={(value: any) => `$${(value as number).toLocaleString()}`}
          labelStyle={{ color: '#000' }}
        />
        <Line
          type="monotone"
          dataKey="balance"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={{
            fill: '#3b82f6',
            r: 4,
          }}
          activeDot={{
            r: 6,
          }}
          isAnimationActive
          name="Balance"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
