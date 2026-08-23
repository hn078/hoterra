import { PrismaClient } from '@prisma/client';
import { requireTenantContext } from './lib/tenantContext';

export const systemPrisma = new PrismaClient();

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

function addTenantToCreateData(data: unknown, tenantId: string): unknown {
  if (Array.isArray(data)) {
    return data.map((row) => addTenantToCreateData(row, tenantId));
  }
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

export const prisma = systemPrisma.$extends({
  name: 'tenant-isolation',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!model || !TENANT_MODELS.has(model)) return query(args);
        const tenant = requireTenantContext();
        return query(scopeArgs(operation, args, tenant.id));
      },
    },
  },
});
