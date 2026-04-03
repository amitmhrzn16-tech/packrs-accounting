'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface IncomeExpenseData {
  month: string;
  income: number;
  expense: number;
}

interface IncomeExpenseChartProps {
  data: IncomeExpenseData[];
}

export function IncomeExpenseChart({ data }: IncomeExpenseChartProps) {
  return (
    <ResponsiveContainer width="100%" height={400}>
      <BarChart
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
          dataKey="month"
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
        <Legend
          wrapperStyle={{ paddingTop: '20px' }}
          iconType="square"
        />
        <Bar
          dataKey="income"
          fill="#10b981"
          name="Income"
          radius={[8, 8, 0, 0]}
        />
        <Bar
          dataKey="expense"
          fill="#ef4444"
          name="Expense"
          radius={[8, 8, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
