import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface DashStatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  to?: string;
  sub?: string;
  sparkline?: boolean;
  accentBorder?: string;
}

const SPARKLINE_HEIGHTS = [40, 65, 45, 80, 55, 90, 70, 60];

export function DashStatCard({ label, value, icon: Icon, iconColor, iconBg, to, sub, sparkline, accentBorder }: DashStatCardProps) {
  return (
    <div className={cn('card p-4', accentBorder && `border-l-4 ${accentBorder}`)}>
      <div className="mb-3 flex items-start justify-between">
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', iconBg)}>
          <Icon className={cn('h-5 w-5', iconColor)} />
        </div>
        {to && (
          <Link to={to} className="text-xs text-hoterra-steel hover:underline">
            View all →
          </Link>
        )}
      </div>
      <div className="text-3xl font-bold text-hoterra-navy">{value}</div>
      <div className="mt-1 text-xs text-gray-500">{label}</div>
      {sub && <div className="mt-0.5 text-[10px] text-gray-400">{sub}</div>}
      {sparkline && (
        <div className="mt-3 flex h-8 items-end gap-0.5">
          {SPARKLINE_HEIGHTS.map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-sm bg-hoterra-steel/25"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
