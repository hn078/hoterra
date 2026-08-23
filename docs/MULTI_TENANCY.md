# HOTERRA multi-tenancy

HOTERRA uses one PostgreSQL cluster with strict row-level tenant isolation. A `Tenant` is one hotel, and every tenant-owned record carries a `tenantId`. The API database client automatically adds the current `tenantId` to reads and writes, including nested creates.

## Tenant resolution

- Production: `hotel-slug.hoterra.net`
- Local development and the apex demo: `DEFAULT_TENANT_SLUG` (currently `hgi`)
- The frontend forwards the browser subdomain in `X-Tenant-Slug` because the API is hosted on a separate Railway domain.
- JWTs contain `tenantId`; a token cannot be reused against another tenant subdomain.

The initial migration creates `Holiday Inn Baku` with slug `hgi` and attaches every existing record to it. New records are assigned automatically by the tenant-aware Prisma client.

## Slug management

System Administrators and General Managers can change the current hotel's slug in Settings. Slugs are normalized, validated, checked against reserved names and verified for uniqueness before the transaction is committed. With the Railway and Cloudflare wildcard domain configured, a newly saved slug becomes reachable without adding an individual DNS record.

## Deployment variables

```text
DEFAULT_TENANT_SLUG=hgi
TENANT_BASE_DOMAIN=hoterra.net
```

The backend startup command runs `prisma db push` and then `migrateTenants` before accepting traffic, so existing installations are backfilled during deployment.

