# HOTERRA verilənlər bazasının arxitekturası

Bu sənəd HOTERRA-nın production PostgreSQL sxemini, tenant (otel) izolyasiyasını və əsas biznes əlaqələrini göstərir. Mənbə: `prisma/schema.prisma` və `prisma/migrations`.

## 1. Arxitektura xülasəsi

| Mövzu | Həll |
|---|---|
| Database | PostgreSQL 17 + Prisma ORM |
| Tenant modeli | Bir database, ortaq cədvəllər, hər otel üçün `tenantId` |
| Tenant seçimi | `https://<slug>.hoterra.net` və `X-Tenant-Slug` |
| İzolyasiya | API filtri + PostgreSQL `FORCE ROW LEVEL SECURITY` |
| Əlaqə bütövlüyü | `tenantId NOT NULL`, `Tenant` foreign key-ləri və tenant relation trigger-ləri |
| Unikal sahələr | Tenant daxilində unikal: məsələn `(tenantId, email)` |
| Fayllar | Tenant prefiksli private storage, yalnız autorizasiyalı API ilə oxunur |
| Migration | Versionlanmış PostgreSQL migration-ları, production-da `migrate deploy` |

Hazırkı ilkin tenant:

- Otel: Holiday Inn Baku
- Slug: `hgi`
- URL: `https://hgi.hoterra.net`
- ID: `00000000-0000-4000-8000-000000000001`

## 2. Production topologiyası

```mermaid
flowchart LR
    U[İstifadəçi] -->|hotel-slug.hoterra.net| FE[Railway Frontend]
    FE -->|HTTPS + X-Tenant-Slug| API[Railway Express API]
    API --> AUTH[JWT + RBAC]
    API --> TC[Tenant-aware Prisma client]
    TC -->|SET hoterra.tenant_id| RLS[PostgreSQL FORCE RLS]
    RLS --> DB[(Ortaq PostgreSQL cədvəlləri)]
    API --> FS[(Persistent private volume)]
    API --> SMTP[SMTP provider]
```

Frontend və backend ayrıca servisdir. Database migration-ları backend deploy-dan əvvəl admin bağlantısı ilə icra edilir. Runtime backend isə superuser olmayan məhdud `hoterra_app` rolu ilə database-ə qoşulur.

## 3. Tenant necə müəyyən edilir?

```mermaid
sequenceDiagram
    actor User as İstifadəçi
    participant Web as React frontend
    participant API as Express API
    participant TenantMW as Tenant middleware
    participant DB as PostgreSQL

    User->>Web: https://hgi.hoterra.net
    Web->>API: X-Tenant-Slug: hgi
    API->>DB: Aktiv Tenant-i slug ilə tap
    DB-->>API: tenantId = HGI
    API->>DB: Tenant bağlantısı ilə sorğu
    Note over API,DB: hoterra.tenant_id = HGI
    DB-->>API: RLS yalnız HGI sətirlərini qaytarır
    API-->>Web: Tenant-a məxsus cavab
```

Login-dən sonra JWT-də `tenantId` saxlanılır. JWT tenant-ı ilə hostname/header tenant-ı uyğun gəlməzsə sorğu rədd edilir. İstifadəçinin aktivliyi və cari rolu hər qorunan sorğuda database-dən yenidən yoxlanılır.

## 4. Müdafiə qatları

Tenant səhvi tək bir mexanizmdən asılı deyil:

```mermaid
flowchart TD
    A[Subdomain / X-Tenant-Slug] --> B[Tenant middleware]
    B --> C[JWT tenant uyğunluğu]
    C --> D[Prisma tenant extension]
    D --> E[Connection GUC: hoterra.tenant_id]
    E --> F[PostgreSQL FORCE RLS]
    F --> G[Tenant FK və relation trigger-ləri]
```

- Bütün tenant cədvəllərində `tenantId` məcburidir (`NOT NULL`).
- `tenantId`, `Tenant.id`-yə `ON DELETE RESTRICT` foreign key ilə bağlıdır.
- RLS policy yalnız `current_setting('hoterra.tenant_id')` ilə eyni tenant sətirlərinə icazə verir.
- Runtime rolu PostgreSQL superuser ola bilməz; backend production startup zamanı bunu yoxlayır.
- Cross-tenant `departmentId`, `userId`, `vendorId` kimi əlaqələri ayrıca database trigger-ləri bloklayır.
- Migration/system bağlantısında kontrollu `hoterra.tenant_id=*` istifadə olunur.

## 5. Ümumi tenant sxemi

```mermaid
erDiagram
    TENANT ||--o{ DEPARTMENT : owns
    TENANT ||--o{ USER : owns
    TENANT ||--o{ CUSTOM_ROLE : owns
    TENANT ||--o{ DOCUMENT : owns
    TENANT ||--o{ CONVERSATION : owns
    TENANT ||--o{ VENDOR : owns
    TENANT ||--o{ WORKFORCE_REQUEST : owns
    TENANT ||--o{ NOTIFICATION : owns
    TENANT ||--o{ AUDIT_LOG : owns
    TENANT ||--o| SYSTEM_SETTINGS : configures
    TENANT ||--o| WORKFORCE_SETTINGS : configures

    DEPARTMENT ||--o{ USER : contains
    CUSTOM_ROLE ||--o{ USER : grants

    TENANT {
        string id PK
        string name
        string slug UK
        boolean isActive
    }
    DEPARTMENT {
        string id PK
        string tenantId FK
        string name
        string code
    }
    USER {
        string id PK
        string tenantId FK
        string email
        string passwordHash
        string role
        string departmentId FK
        string customRoleId FK
        boolean isActive
    }
    CUSTOM_ROLE {
        string id PK
        string tenantId FK
        string name
        string baseRole
        json permissions
    }
```

Əsas tenant-scope unique indekslər:

```text
Department        (tenantId, name), (tenantId, code)
User              (tenantId, email)
CustomRole        (tenantId, name)
Document          (tenantId, code)
Conversation      (tenantId, directKey), (tenantId, type, departmentId)
WorkforcePosition (tenantId, name)
Vendor            (tenantId, name)
WorkforceRequest  (tenantId, code)
```

Bu yanaşma fərqli otellərdə eyni email, departament kodu, vendor adı və sənəd kodunun istifadə olunmasına imkan verir, eyni otel daxilində təkrarı bloklayır.

## 6. Document Management sxemi

```mermaid
erDiagram
    DEPARTMENT ||--o{ DOCUMENT : owns
    USER ||--o{ DOCUMENT : authors
    TEMPLATE ||--o{ DOCUMENT : creates
    WORKFLOW_ROUTE ||--o{ DOCUMENT : routes
    DOCUMENT ||--o{ DOCUMENT_VERSION : versions
    DOCUMENT ||--o{ DOCUMENT_HISTORY : records
    DOCUMENT ||--o{ SIGNATURE : signs
    DOCUMENT ||--o{ DOCUMENT_COMMENT : comments
    DOCUMENT ||--o{ DOCUMENT_ATTACHMENT : attaches
    DOCUMENT ||--o{ USER_FAVORITE : favorites

    DOCUMENT {
        string id PK
        string tenantId FK
        string code
        string title
        string status
        string departmentId FK
        string authorId FK
        string ownerId FK
        string templateId FK
        string workflowId FK
        string filePath
    }
    DOCUMENT_VERSION {
        string id PK
        string tenantId FK
        string documentId FK
        string version
        string filePath
    }
    SIGNATURE {
        string id PK
        string tenantId FK
        string documentId FK
        string userId FK
        datetime signedAt
        string docHash
    }
```

Fayl yolları database-də tenant prefiksi ilə saxlanılır. `/uploads` public static route deyil; sənəd və imza faylları yalnız `/api/files/...` üzərindən JWT, tenant və sənəd səlahiyyəti yoxlandıqdan sonra verilir.

## 7. Casual Workforce sxemi

```mermaid
erDiagram
    DEPARTMENT ||--o{ WORKFORCE_POSITION : defines
    DEPARTMENT ||--o{ WORKFORCE_REQUEST : requests
    DEPARTMENT ||--o| WORKFORCE_APPROVAL_ROUTE : configures
    DEPARTMENT ||--o{ DEPARTMENT_CASUAL_BUDGET : budgets
    USER ||--o{ WORKFORCE_REQUEST : creates
    VENDOR ||--o{ VENDOR_SERVICE_RATE : offers
    WORKFORCE_POSITION ||--o{ VENDOR_SERVICE_RATE : priced
    WORKFORCE_REQUEST ||--o{ WORKFORCE_REQUEST_ITEM : contains
    WORKFORCE_REQUEST ||--o{ WORKFORCE_VENDOR_CORRECTION : changes
    WORKFORCE_REQUEST ||--o{ WORKFORCE_VENDOR_CORRECTION_REVIEW : reviews
    WORKFORCE_REQUEST ||--o{ WORKFORCE_QUALITY_EVALUATION : evaluates
    WORKFORCE_REQUEST ||--o{ WORKFORCE_REQUEST_EVENT : audits
    WORKFORCE_REQUEST ||--o{ VENDOR_INVITE : dispatches
    WORKFORCE_REQUEST ||--o{ VENDOR_INVOICE : invoices

    WORKFORCE_REQUEST {
        string id PK
        string tenantId FK
        string code
        string departmentId FK
        string createdById FK
        datetime workDate
        datetime endDate
        string status
        float estimatedCost
        float actualCost
    }
    WORKFORCE_REQUEST_ITEM {
        string id PK
        string tenantId FK
        string requestId FK
        string positionId FK
        string rateUnit
        int quantity
        float hours
        string vendorId FK
        string vendorRateId FK
    }
    VENDOR {
        string id PK
        string tenantId FK
        string name
        string status
        boolean active
    }
    VENDOR_SERVICE_RATE {
        string id PK
        string tenantId FK
        string vendorId FK
        string positionId FK
        string unit
        decimal price
    }
```

Procurement vendor dəyişdikdə correction və review qeydləri ayrıca saxlanılır; Finance Director və General Manager təsdiqləri audit event-ləri ilə izlənir. Hər request item öz seçilmiş vendor və rate məlumatını saxladığı üçün bir request bir neçə vendorla icra oluna bilər.

## 8. Mesajlaşma və bildirişlər

```mermaid
erDiagram
    CONVERSATION ||--o{ CONVERSATION_PARTICIPANT : includes
    CONVERSATION ||--o{ MESSAGE : contains
    USER ||--o{ CONVERSATION_PARTICIPANT : joins
    USER ||--o{ MESSAGE : sends
    USER ||--o{ NOTIFICATION : receives
    EMAIL_OUTBOX }o--|| TENANT : belongs
```

Email birbaşa request thread-i içində göndərilmir. SMTP feature-i aktivdirsə əvvəl `EmailOutbox`-a `QUEUED` yazılır, background worker göndərir və `SENT`/`FAILED`, cəhd sayı, növbəti cəhd və son xəta saxlanılır. Feature söndürülübsə qeyd `DISABLED` olur və in-app bildiriş axınına təsir etmir.

## 9. Migration ardıcıllığı

```text
0_postgresql_baseline                 Mövcud PostgreSQL sxeminin baseline-i
20260824010000_tenant_integrity       NOT NULL, FK, tenant unique indeksləri
20260824020000_tenant_rls             ENABLE/FORCE RLS və policy-lər
20260824030000_email_outbox_delivery  SMTP outbox retry sahələri
20260824040000_tenant_relation_integrity Cross-tenant əlaqə trigger-ləri
```

Production deploy zamanı:

```mermaid
flowchart LR
    A[Railway pre-deploy] --> B[production-migrate.cjs]
    B --> C[Legacy tenant backfill]
    C --> D[Baseline detection]
    D --> E[prisma migrate deploy]
    E --> F[Backend start]
    F --> G[/api/ready]
```

`prisma db push` və `--accept-data-loss` production startup-da istifadə edilmir.

## 10. Database rolları

| Bağlantı | Dəyişən | Məqsəd |
|---|---|---|
| Admin/migration | `DATABASE_ADMIN_URL` | Schema migration, baseline, rol provisioning |
| Runtime app | `DATABASE_URL` | Yalnız tətbiqin gündəlik CRUD əməliyyatları |

Runtime istifadəçisi `NOSUPERUSER` olmalıdır. Onu yaratmaq üçün admin URL ilə:

```bash
npm run db:provision-app-role
```

Sonra `DATABASE_URL` məhdud istifadəçiyə, `DATABASE_ADMIN_URL` isə Railway secret olaraq admin bağlantısına verilir.

## 11. Backup və bərpa

Production database üçün Railway backup/PITR aktiv edilməli, periodik restore sınağı aparılmalıdır. Persistent upload volume ayrıca backup edilməlidir; database backup faylların özünü deyil, yalnız onların yollarını saxlayır.

## 12. Yoxlama əmrləri

```bash
npm run typecheck
npm test
npm run build:app
npm run db:migrate:deploy
npm run test:tenant-isolation
npm audit --omit=dev --audit-level=high
```

CI bu yoxlamaları PostgreSQL 17 service üzərində hər push və pull request üçün icra edir.
