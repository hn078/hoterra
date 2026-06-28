import { Header } from '@/components/layout/Sidebar';

export function PlaceholderPage({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header title={title} subtitle={subtitle} />
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-hoterra-navy/10 text-2xl font-bold text-hoterra-navy">
            H
          </div>
          <h2 className="text-lg font-semibold text-hoterra-navy">{title}</h2>
          <p className="mt-2 text-sm text-gray-500">
            This module will be available in the next development stage.
          </p>
        </div>
      </div>
    </div>
  );
}
