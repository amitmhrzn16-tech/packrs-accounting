import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  change?: number;
  changeLabel?: string;
}

export function StatCard({
  title,
  value,
  icon,
  change,
  changeLabel,
}: StatCardProps) {
  const isPositive = change !== undefined && change >= 0;
  const isNegative = change !== undefined && change < 0;

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>

          {change !== undefined && (
            <div className="mt-3 flex items-center gap-1">
              <span
                className={cn(
                  'text-sm font-medium',
                  isPositive && 'text-emerald-600',
                  isNegative && 'text-red-600'
                )}
              >
                {isPositive ? '+' : ''}{change.toFixed(1)}%
              </span>
              {changeLabel && (
                <span className="text-xs text-gray-500">{changeLabel}</span>
              )}
            </div>
          )}
        </div>

        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
          {icon}
        </div>
      </div>
    </Card>
  );
}
