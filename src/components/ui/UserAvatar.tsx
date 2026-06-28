import { cn, getInitials } from '@/lib/utils';

interface UserAvatarProps {
  firstName: string;
  lastName: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = {
  sm: 'h-7 w-7 text-[10px]',
  md: 'h-9 w-9 text-xs',
  lg: 'h-12 w-12 text-sm',
};

export function UserAvatar({ firstName, lastName, size = 'md', className }: UserAvatarProps) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-hoterra-steel font-semibold text-white',
        SIZES[size],
        className
      )}
    >
      {getInitials(firstName, lastName)}
    </div>
  );
}
