# HOTERRA

HOTERRA otellər üçün multi-tenant document management, approval workflow və Casual Workforce platformasıdır. Hər otel ayrıca `*.hoterra.net` subdomain-i, istifadəçiləri, sənədləri, vendorları və əməliyyat məlumatları ilə işləyir.

## Əsas imkanlar

- JWT autentifikasiya, RBAC və custom rollar
- Departament, sənəd, versiya, workflow, imza və audit idarəetməsi
- Casual Workforce request, çoxsətirli servis seçimi və approval route
- Procurement vendor kataloqu, qiymət müqayisəsi və vendor correction review
- Finance Director və General Manager təsdiqləri
- Vendor qiymətləndirməsi, invoice, payroll və geniş reportlar
- Tenant-a məxsus bildiriş, mesajlaşma və SMTP email outbox
- `*.hoterra.net` subdomain-ləri ilə hotel tenant-ları

## Texnologiyalar

| Komponent | Texnologiya |
|---|---|
| Frontend | React 19, TypeScript, Tailwind CSS, Vite |
| Backend | Node.js, Express 5, TypeScript |
| Database | PostgreSQL 17, Prisma ORM |
| Auth | JWT (HS256), bcrypt |
| Deployment | Railway frontend/backend/PostgreSQL |

## Lokal quraşdırma

Tələblər: Node.js 20–24, Docker Desktop.

```bash
npm install
docker compose up -d
npm run db:migrate:deploy
npm run db:seed
npm run dev
```

Frontend: `http://localhost:5173`

Backend readiness: `http://127.0.0.1:3211/api/ready`

Demo seed şifrələri repoda saxlanılmır və console-a çıxarılmır. Lokal demo üçün `DEMO_USER_PASSWORD`, `DEMO_GM_PASSWORD` və `DEMO_SIGNATURE_PIN` environment dəyişənlərindən istifadə edin. Production-da demo seed default olaraq bloklanır.

## Database və tenant təhlükəsizliyi

Sistem ortaq PostgreSQL cədvəllərində `tenantId` istifadə edir və tenant izolyasiyasını bir neçə qatla qoruyur:

- tenant-aware Prisma client;
- məhdud, superuser olmayan runtime database rolu;
- PostgreSQL `FORCE ROW LEVEL SECURITY`;
- `tenantId NOT NULL` və `Tenant` foreign key-ləri;
- cross-tenant əlaqə trigger-ləri;
- tenant-scope unique indeksləri.

Ətraflı sxemlər: [Database Architecture](docs/DATABASE_ARCHITECTURE.md).

Tenant davranışı: [Multi-tenancy](docs/MULTI_TENANCY.md).

Production checklist: [Production Readiness](docs/PRODUCTION_READINESS.md).

## Yoxlamalar

```bash
npm run typecheck
npm test
npm run build:app
npm audit --omit=dev --audit-level=high
npm run test:tenant-isolation
```

GitHub Actions bu yoxlamaları PostgreSQL 17 ilə hər push və pull request üçün icra edir.

## Windows tətbiqi

Windows installer production `https://hgi.hoterra.net` workspace-i üçün təhlükəsiz Electron wrapper-dir; ayrıca lokal database saxlamır. Buna görə web və desktop eyni PostgreSQL məlumatından istifadə edir. Lokal development zamanı wrapper `http://localhost:5173` ünvanını açır.

## Production deploy

Backend deploy-dan əvvəl Railway `preDeployCommand` versionlanmış migration-ları tətbiq edir. Production startup heç vaxt `prisma db push` və ya `--accept-data-loss` işə salmır.

Əsas environment dəyişənləri `.env.example` və [Production Readiness](docs/PRODUCTION_READINESS.md) sənədində göstərilib. Secret-ləri git-ə commit etməyin.

## Lisenziya

Proprietary / `UNLICENSED`.
