import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantContext {
  id: string;
  slug: string;
  name: string;
}

const storage = new AsyncLocalStorage<TenantContext>();

export function runWithTenant<T>(tenant: TenantContext, callback: () => T): T {
  return storage.run(tenant, callback);
}

export function getTenantContext(): TenantContext | undefined {
  return storage.getStore();
}

export function requireTenantContext(): TenantContext {
  const tenant = getTenantContext();
  if (!tenant) {
    throw new Error('Tenant context is required for this database operation');
  }
  return tenant;
}

