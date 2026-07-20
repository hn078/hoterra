import { cn } from '@/lib/utils';

export function formatCountBadge(count: number, max = 99): string {
  if (count > max) return `${max}+`;
  return String(count);
}

const SIZE_BY_LENGTH: Record<number, string> = {
  1: 'size-5',
  2: 'size-6',
  3: 'size-7',
};

interface CountBadgeProps {
  count: number;
  max?: number;
  className?: string;
}

export function CountBadge({ count, max = 99, className }: CountBadgeProps) {
  const label = formatCountBadge(count, max);
  const sizeClass = SIZE_BY_LENGTH[label.length] ?? 'size-7';

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-hoterra-gold text-[10px] font-bold leading-none tabular-nums text-hoterra-navy',
        sizeClass,
        className
      )}
    >
      {label}
    </span>
  );
}
