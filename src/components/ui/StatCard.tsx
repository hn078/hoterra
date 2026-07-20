import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: LucideIcon;
  color?: 'blue' | 'green' | 'orange' | 'purple' | 'red' | 'gray' | 'cyan';
}

const COLORS = {
  blue: 'bg-blue-50 text-blue-600 border-blue-100',
  green: 'bg-green-50 text-green-600 border-green-100',
  orange: 'bg-orange-50 text-orange-600 border-orange-100',
  purple: 'bg-purple-50 text-purple-600 border-purple-100',
  red: 'bg-red-50 text-red-600 border-red-100',
  gray: 'bg-gray-50 text-gray-600 border-gray-100',
  cyan: 'bg-cyan-50 text-cyan-600 border-cyan-100',
};

export function StatCard({ label, value, sub, icon: Icon, color = 'blue' }: StatCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <div className="flex items-center gap-2.5">
        <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border', COLORS[color])}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-gray-500">{label}</p>
          <p className="truncate text-xl font-bold leading-tight text-hoterra-navy">{value}</p>
          {sub && <p className="truncate text-[10px] leading-tight text-gray-400">{sub}</p>}
        </div>
      </div>
    </div>
  );
}
