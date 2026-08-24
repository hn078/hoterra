# HOTERRA production readiness

Bu checklist production release və Railway konfiqurasiyası üçün əsas mənbədir.

## 1. Servis topologiyası

| Servis | Build | Start | Health |
|---|---|---|---|
| Frontend | `npm run build:frontend` | `npm run start:frontend` | `/` |
| Backend | `npm run build:backend` | `npm run start:backend` | `/api/ready` |
| PostgreSQL | Railway PostgreSQL 17 | managed | Railway-managed |

`.railway/railway.ts` frontend, backend, PostgreSQL, volume-lar, migration pre-deploy və Germany/EU West region replica konfiqurasiyasını kod kimi saxlayır.

## 2. Məcburi production environment-ləri

### Backend

```text
NODE_ENV=production
DATABASE_ADMIN_URL=<Railway admin PostgreSQL URL>
DATABASE_URL=<hoterra_app restricted PostgreSQL URL>
JWT_SECRET=<minimum 32 character cryptographic random secret>
FRONTEND_URL=https://hoterra.net
CORS_ORIGINS=https://hoterra.net,https://www.hoterra.net
TENANT_BASE_DOMAIN=hoterra.net
DEFAULT_TENANT_SLUG=hgi
HOTERRA_UPLOADS_DIR=/app/uploads
EMAIL_DELIVERY_ENABLED=false
SMTP_HOST=<provider host>
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<secret>
SMTP_PASSWORD=<secret>
SMTP_FROM=HOTERRA <noreply@hoterra.net>
```

### Frontend

```text
NODE_ENV=production
VITE_API_URL=https://<backend-domain>/api
```

Secret-lər yalnız Railway Variables-də saxlanılır; repo, build log və frontend `VITE_*` dəyişənlərinə verilməməlidir.

## 3. Database rolunun hazırlanması

Migration üçün admin URL qalır, gündəlik backend isə ayrıca restricted role istifadə edir:

```bash
APP_DATABASE_USER=hoterra_app \
APP_DATABASE_PASSWORD=<random-24+-character-password> \
DATABASE_ADMIN_URL=<admin-url> \
npm run db:provision-app-role
```

Sonra `DATABASE_URL` həmin istifadəçinin URL-i olmalıdır. Production startup aşağıdakı hallarda fail-closed işləyir:

- runtime DB user superuser-dirsə;
- RLS/`FORCE RLS` migration-ları tam deyil;
- connection tenant GUC işləmirsə;
- PostgreSQL əvəzinə başqa provider verilibsə.

## 4. Persistent fayllar

Backend servisə Railway Volume qoşulmalı və mount path `/app/uploads` seçilməlidir. `HOTERRA_UPLOADS_DIR=/app/uploads` olmalıdır. Upload-lar public deyil və tenant prefiksi ilə saxlanılır.

Volume qoşulmadan production config backend-i açmağa qoymur. Horizontal replica sayı artırılmazdan əvvəl shared object storage (məsələn S3/R2) adapterinə keçmək lazımdır; tək volume eyni anda bir deployment replica üçün nəzərdə tutulur.

## 5. Domain və TLS

- `hoterra.net` və `www.hoterra.net` frontend servisə bağlıdır.
- `*.hoterra.net` wildcard frontend servisə bağlıdır.
- API ayrıca HTTPS Railway/custom domain-dədir.
- DNS wildcard və custom-domain ownership/TLS statusu Railway/Cloudflare-də aktiv olmalıdır.
- `CORS_ORIGINS` apex domenləri saxlayır; backend valid `https://<slug>.hoterra.net` origin-lərinə də icazə verir.

## 6. Email

Email göndərişi feature gate-dir. SMTP hazır deyilə `EMAIL_DELIVERY_ENABLED=false` saxlanılır və email outbox qeydi `DISABLED` olur; in-app bildirişlər işləməyə davam edir. Aktiv etmək üçün `EMAIL_DELIVERY_ENABLED=true` və bütün `SMTP_*` secret-ləri verilməlidir. Email `EmailOutbox` cədvəli vasitəsilə retry olunur. Aktivləşdirmədən əvvəl:

- test bildirişi göndərin;
- `SENT` statusunu yoxlayın;
- SPF, DKIM və DMARC DNS qeydlərini aktiv edin;
- bounce/complaint monitorinqini provider-də qurun.

## 7. Backup və disaster recovery

- Railway PostgreSQL daily backup və mümkün olduqda PITR aktiv edin.
- Retention müddətini müqavilə və hotel siyasətinə uyğun seçin.
- Upload volume üçün ayrıca periodik backup/export yaradın.
- Ən azı rübdə bir dəfə yeni test database və volume-a restore drill edin.
- Restore vaxtını və itirilə biləcək maksimum data intervalını qeyd edin (RTO/RPO).

## 8. Release gate

```bash
npm ci
npm audit --omit=dev --audit-level=high
npm run production:check
npm run db:migrate:deploy
npm run test:tenant-isolation
```

Gözlənilən nəticə:

- typecheck: 0 error;
- unit/guard testləri: hamısı pass;
- tenant isolation integration: pass;
- production dependency audit: 0 high/critical;
- frontend və backend build: pass;
- `/api/ready`: HTTP 200.

## 9. Observability

Backend strukturlaşdırılmış request log-u, request ID, status və duration yazır. Railway-də aşağıdakılar üçün alert qurulmalıdır:

- `/api/ready` failure və restart loop;
- 5xx error artımı;
- PostgreSQL connection/CPU/storage limitləri;
- `EmailOutbox`-da davamlı `FAILED` qeydləri;
- volume istifadəsi;
- backup failure.

Log-larda JWT, password, SMTP credential, email subject/body və fayl məzmunu yazılmamalıdır.

## 10. Release sonrası smoke test

1. `https://hgi.hoterra.net` login səhifəsini açır.
2. Mövcud olmayan slug tenant məlumatını və login sessiyasını vermir.
3. HGI istifadəçisi login olur və başqa tenant token/header kombinasiyası 403 alır.
4. Sənəd upload/download yalnız autorizasiyalı istifadəçidə işləyir.
5. HoD yalnız öz departament request-lərini görür.
6. Workforce approval ardıcıllığı HoD → HR HoD → Finance Director → GM → Procurement işləyir.
7. Vendor correction review və notification link-ləri düzgün request-i açır.
8. SMTP notification çatır və outbox `SENT` olur.
9. Backup yaradılır və restore prosedurunun sənədi əlçatandır.
