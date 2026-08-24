# HOTERRA multi-tenancy

HOTERRA bir PostgreSQL cluster-i və ortaq cədvəllər üzərində işləyir. Bir `Tenant` bir oteldir; bütün tenant-owned sətirlərdə məcburi `tenantId` var.

## Tenant resolution

- Production: `https://<hotel-slug>.hoterra.net`
- Lokal development və apex demo: `DEFAULT_TENANT_SLUG`
- Frontend subdomain-i ayrıca Railway API-yə `X-Tenant-Slug` header-i ilə ötürür.
- JWT `tenantId` daşıyır; token başqa tenant subdomain-ində istifadə edilə bilməz.
- Mövcud olmayan, reserved və ya deaktiv slug üçün login workspace-i açılmır.

## İzolyasiya

Tenant məlumatları aşağıdakı müdafiə qatlarından keçir:

1. Tenant middleware slug-ı aktiv `Tenant` qeydinə resolve edir.
2. Protected route JWT tenant-ı ilə request tenant-ını müqayisə edir.
3. Prisma extension bütün read/write əməliyyatlarına tenant filter-i əlavə edir.
4. Tenant Prisma bağlantısı PostgreSQL session GUC `hoterra.tenant_id` təyin edir.
5. Bütün tenant cədvəllərində `FORCE ROW LEVEL SECURITY` yalnız həmin tenant-a icazə verir.
6. Foreign key-lər və tenant relation trigger-ləri cross-tenant əlaqəni bloklayır.

Runtime `DATABASE_URL` PostgreSQL superuser ola bilməz. Backend production startup bunu yoxlayır və təhlükəli konfiqurasiya ilə açılmır.

## Slug idarəetməsi

System Administrator və General Manager Settings bölməsində öz otelinin slug-ını dəyişə bilər. Slug:

- normalize və format validation-dan keçir;
- reserved slug siyahısına qarşı yoxlanılır;
- database unique constraint və transaction ilə race-safe yoxlanılır.

Wildcard DNS və Railway domain konfiqurasiyası olduqda yeni slug ayrıca DNS qeydi olmadan aktiv olur.

## Deploy dəyişənləri

```text
DEFAULT_TENANT_SLUG=hgi
TENANT_BASE_DOMAIN=hoterra.net
DATABASE_ADMIN_URL=<migration-admin-connection>
DATABASE_URL=<non-superuser-runtime-connection>
TENANT_DB_CONNECTION_LIMIT=3
```

Deploy ardıcıllığı:

1. Railway pre-deploy `npm run db:migrate:deploy` icra edir.
2. Legacy deployment olarsa tenant backfill və baseline təhlükəsiz şəkildə hazırlanır.
3. `prisma migrate deploy` yalnız versionlanmış PostgreSQL migration-larını tətbiq edir.
4. Backend `migrateTenants` idempotent yoxlamasından sonra açılır.
5. Railway `/api/ready` ilə database readiness-i yoxlayır.

Production startup-da `prisma db push` və data-loss flag-ləri istifadə edilmir.

Tam sxem: [DATABASE_ARCHITECTURE.md](DATABASE_ARCHITECTURE.md).

İnfrastruktur checklist-i: [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md).
