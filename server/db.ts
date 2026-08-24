import { PrismaClient } from '@prisma/client';
import { requireTenantContext } from './lib/tenantContext';

const TENANT_MODELS = new Set([
  'Department', 'User', 'CustomRole', 'Document', 'DocumentVersion', 'DocumentHistory',
  'DocumentComment', 'DocumentAttachment', 'Template', 'WorkflowRoute', 'Signature',
  'AuditLog', 'Notification', 'SystemSettings', 'UserFavorite', 'Conversation',
  'ConversationParticipant', 'Message', 'WorkforcePosition', 'Vendor', 'VendorServiceRate',
  'VendorApprovalEvent', 'WorkforceApprovalRoute', 'DepartmentCasualBudget',
  'WorkforceSettings', 'WorkforceRequest', 'WorkforceRequestItem',
  'WorkforceVendorCorrectionReview', 'WorkforceVendorCorrection',
  'WorkforceQualityEvaluation', 'WorkforceRequestEvent', 'WorkforceRequestTemplate',
  'VendorInvite', 'VendorInvoice', 'EmailOutbox',
]);

function databaseUrlForTenant(tenantId: string, connectionLimit: number): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  const url = new URL(raw);
  const currentOptions = url.searchParams.get('options') || '';
  url.searchParams.set('options', `${currentOptions} -c hoterra.tenant_id=${tenantId}`.trim());
  if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', String(connectionLimit));
  return url.toString();
}

function newClient(tenantId: string, connectionLimit: number): PrismaClient {
  const url = databaseUrlForTenant(tenantId, connectionLimit);
  return new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
}

// The system client deliberately uses the wildcard RLS context. Request
// handlers must always use `prisma`, never this infrastructure client.
export const systemPrisma = newClient('*', 2);

function addTenantToCreateData(data: unknown, tenantId: string): unknown {
  if (Array.isArray(data)) return data.map((row) => addTenantToCreateData(row, tenantId));
  if (!data || typeof data !== 'object') return data;
  return { ...(data as Record<string, unknown>), tenantId };
}

function addTenantToNestedWrites(value: unknown, tenantId: string): unknown {
  if (Array.isArray(value)) return value.map((item) => addTenantToNestedWrites(item, tenantId));
  if (!value || typeof value !== 'object') return value;

  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(source)) {
    if (key === 'create') {
      result[key] = addTenantToCreateData(addTenantToNestedWrites(item, tenantId), tenantId);
    } else if (key === 'createMany' && item && typeof item === 'object') {
      const createMany = item as Record<string, unknown>;
      result[key] = {
        ...createMany,
        data: addTenantToCreateData(addTenantToNestedWrites(createMany.data, tenantId), tenantId),
      };
    } else {
      result[key] = addTenantToNestedWrites(item, tenantId);
    }
  }
  return result;
}

function scopeArgs(operation: string, input: unknown, tenantId: string) {
  const args = { ...((input || {}) as Record<string, unknown>) };
  const whereOperations = new Set([
    'findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany',
    'count', 'aggregate', 'groupBy', 'update', 'updateMany', 'updateManyAndReturn',
    'delete', 'deleteMany', 'upsert',
  ]);

  if (whereOperations.has(operation)) {
    args.where = { ...((args.where || {}) as Record<string, unknown>), tenantId };
  }
  if (operation === 'create' || operation === 'createMany' || operation === 'createManyAndReturn') {
    args.data = addTenantToCreateData(addTenantToNestedWrites(args.data, tenantId), tenantId);
  } else if (operation === 'update' || operation === 'updateMany' || operation === 'updateManyAndReturn') {
    args.data = addTenantToCreateData(addTenantToNestedWrites(args.data, tenantId), tenantId);
  } else if (operation === 'upsert') {
    args.create = addTenantToCreateData(addTenantToNestedWrites(args.create, tenantId), tenantId);
    args.update = addTenantToCreateData(addTenantToNestedWrites(args.update, tenantId), tenantId);
  }
  return args;
}

function createTenantClient(tenantId: string) {
  const connectionLimit = Math.max(1, Math.min(10, Number(process.env.TENANT_DB_CONNECTION_LIMIT) || 3));
  return newClient(tenantId, connectionLimit).$extends({
    name: 'tenant-isolation',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_MODELS.has(model)) return query(args);
          return query(scopeArgs(operation, args, tenantId));
        },
      },
    },
  });
}

type TenantPrismaClient = ReturnType<typeof createTenantClient>;
const tenantClients = new Map<string, TenantPrismaClient>();

function tenantClient(): TenantPrismaClient {
  const tenantId = requireTenantContext().id;
  let client = tenantClients.get(tenantId);
  if (!client) {
    client = createTenantClient(tenantId);
    tenantClients.set(tenantId, client);
  }
  return client;
}

export const prisma = new Proxy({} as TenantPrismaClient, {
  get(_target, property) {
    const client = tenantClient();
    const value = Reflect.get(client, property);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

export async function disconnectPrisma(): Promise<void> {
  await Promise.all([
    systemPrisma.$disconnect(),
    ...[...tenantClients.values()].map((client) => client.$disconnect()),
  ]);
  tenantClients.clear();
}
