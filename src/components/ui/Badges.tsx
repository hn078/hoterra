import { cn } from '@/lib/utils';
import type { DocumentCategory } from '@/types';
import { CATEGORY_LABELS } from '@/types';

const CATEGORY_STYLES: Record<DocumentCategory, string> = {
  POLICIES: 'bg-purple-100 text-purple-800',
  SOP: 'bg-blue-100 text-blue-800',
  FORMS: 'bg-amber-100 text-amber-800',
  CHECKLISTS: 'bg-green-100 text-green-800',
  TEMPLATES: 'bg-violet-100 text-violet-800',
  REPORTS: 'bg-cyan-100 text-cyan-800',
  CONTRACTS: 'bg-orange-100 text-orange-800',
  TRAINING_MATERIALS: 'bg-pink-100 text-pink-800',
  ARCHIVE: 'bg-gray-100 text-gray-700',
};

export function CategoryBadge({ category }: { category: DocumentCategory | string }) {
  const key = category as DocumentCategory;
  const label = CATEGORY_LABELS[key] ?? String(category).replace(/_/g, ' ');
  const style = CATEGORY_STYLES[key] ?? 'bg-gray-100 text-gray-700';
  return <span className={cn('badge-pill', style)}>{label}</span>;
}

export function DepartmentPill({ name, color }: { name: string; color?: string }) {
  const bg = color ? `${color}20` : '#29466020';
  const text = color || '#294660';
  return (
    <span
      className="badge-pill font-medium"
      style={{ backgroundColor: bg, color: text }}
    >
      {name}
    </span>
  );
}

export function FileTypeIcon({ category }: { category?: string }) {
  const colors: Record<string, string> = {
    SOP: 'text-red-500',
    POLICIES: 'text-red-500',
    FORMS: 'text-blue-500',
    CHECKLISTS: 'text-green-500',
    TEMPLATES: 'text-blue-600',
    REPORTS: 'text-green-600',
  };
  const c = colors[category ?? ''] ?? 'text-red-500';
  return (
    <svg className={cn('h-4 w-4 shrink-0', c)} viewBox="0 0 24 24" fill="currentColor">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2l5 5h-5V4zM8 13h8v2H8v-2zm0 4h8v2H8v-2z" />
    </svg>
  );
}
