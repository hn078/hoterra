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
    <div className={cn('card p-3', accentBorder && `border-l-4 ${accentBorder}`)}>
      <div className="flex items-center gap-2.5">
        <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', iconBg)}>
          <Icon className={cn('h-4 w-4', iconColor)} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xl font-bold leading-tight text-hoterra-navy">{value}</div>
          <div className="truncate text-xs text-gray-500">{label}</div>
          {sub && <div className="truncate text-[10px] leading-tight text-gray-400">{sub}</div>}
        </div>
        {to && (
          <Link to={to} className="shrink-0 self-start text-[10px] text-hoterra-steel hover:underline">
            View all →
          </Link>
        )}
      </div>
      {sparkline && (
        <div className="mt-2 flex h-6 items-end gap-0.5">
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
