import { cn } from '@/lib/utils';

export interface TabItem {
  id: string;
  label: string;
  count?: number;
}

interface PageTabsProps {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
}

export function PageTabs({ tabs, active, onChange }: PageTabsProps) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-gray-200 px-6">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            'relative px-4 py-3 text-sm font-medium transition-colors',
            active === tab.id
              ? 'text-hoterra-gold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-hoterra-gold'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className="ml-1.5 text-gray-400">({tab.count})</span>
          )}
        </button>
      ))}
    </div>
  );
}
