import { ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';
import type { Capability } from './capabilities';
import { hasEveryCapability } from './capabilities';
export function CapabilityRoute({
  require: required,
  children,
}: {
  require: Capability | readonly Capability[];
  children: React.ReactNode;
}) {
  const user = useAuthStore((state) => state.user);
  const capabilities = Array.isArray(required) ? required : [required];

  if (hasEveryCapability(user, capabilities)) return children;

  return (
    <div className="flex flex-1 items-center justify-center bg-hoterra-page p-6">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-xl font-bold text-hoterra-navy">Access restricted</h1>
        <p className="mt-2 text-sm leading-6 text-gray-500">
          Your account does not have permission to open this area. If this is unexpected, contact a system administrator.
        </p>
        {hasEveryCapability(user, ['dashboard.view']) && (
          <Link to="/app" replace className="btn-primary mt-6 inline-flex">
            Return to dashboard
          </Link>
        )}
      </div>
    </div>
  );
}
