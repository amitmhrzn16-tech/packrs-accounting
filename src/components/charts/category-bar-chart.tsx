'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

interface CategoryBarData {
  name: string;
  value: number;
  color?: string;
}

interface CategoryBarChartProps {
  data: CategoryBarData[];
  barColor?: string;
  formatValue?: (v: number) => string;
}

export function CategoryBarChart({
  data,
  barColor = '#3b82f6',
  formatValue,
}: CategoryBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={400}>
      <BarChart
        data={data}
        margin={{ top: 10, right: 20, left: 0, bottom: 60 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: '#4b5563' }}
          interval={0}
          angle={-30}
          textAnchor="end"
          height={70}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#4b5563' }}
          tickFormatter={(v) =>
            formatValue ? formatValue(Number(v)) : Number(v).toLocaleString()
          }
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
          }}
          formatter={(value: any) => [
            formatValue ? formatValue(value as number) : (value as number).toLocaleString(),
            'Amount',
          ]}
          labelStyle={{ color: '#000' }}
        />
        <Bar dataKey="value" fill={barColor} radius={[6, 6, 0, 0]}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color || barColor} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
