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
VITE_API_URL=https://api.hoterra.net/api
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
- runtime DB user `BYPASSRLS` hüququna malikdirsə;
- RLS/`FORCE RLS` migration-ları tam deyil;
- connection tenant GUC işləmirsə və ya policy köhnə `*` wildcard-a icazə verirsə;
- PostgreSQL əvəzinə başqa provider verilibsə.

## 4. Persistent fayllar

Backend servisə Railway Volume qoşulmalı və mount path `/app/uploads` seçilməlidir. `HOTERRA_UPLOADS_DIR=/app/uploads` olmalıdır. Upload-lar public deyil və tenant prefiksi ilə saxlanılır.

Volume qoşulmadan production config backend-i açmağa qoymur. Horizontal replica sayı artırılmazdan əvvəl shared object storage (məsələn S3/R2) adapterinə keçmək lazımdır; tək volume eyni anda bir deployment replica üçün nəzərdə tutulur.

## 5. Domain və TLS

- `hoterra.net` və `www.hoterra.net` frontend servisə bağlıdır.
- `*.hoterra.net` wildcard frontend servisə bağlıdır.
- API `https://api.hoterra.net` custom domain-i ilə Railway backend-ə yönləndirilir.
- Cloudflare DNS-də `api` CNAME Railway-in verdiyi custom-domain target-ə proxied olaraq bağlıdır.
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
npm run test:document-search-e2e
npm run test:audit-integrity-e2e
```

`test:tenant-isolation` müvəqqəti tenant və biznes obyektləri yaradıb sonda silir. Onu CI/local disposable PostgreSQL-də işlədin. Remote staging database üçün əlavə olaraq `TENANT_ISOLATION_ALLOW_REMOTE=true` tələb olunur; canlı production database üzərində bu flag-i verməyin.

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

JWT logout, parol reset və hər account activation/deactivation keçidindən sonra database `tokenVersion` yoxlaması ilə ləğv olunur. Buna görə deaktivasiya öncəsi token hesab sonradan yenidən aktivləşdirilsə də bərpa edilmir. Son aktiv System Administrator transaction lock və count invariantı ilə deactivate/demote edilə bilməz. Vendor portalının yeni magic-link tokenləri database-də açıq deyil, SHA-256 digest kimi saxlanılır; link müddəti bitdikdən sonra sifariş detalları qaytarılmır.

Document imzaları `documentVersion`, `approvalCycle` və real SHA-256 source digest-i ilə saxlanılır. Review başlayandan sonra metadata və primary file dəyişdirilə bilməz. Return, archive/restore və new-version keçidləri approval cycle-ı artırır; əvvəlki cycle imzası yeni qərarı təsdiqləyə bilməz.

Tenant session lifetime və password policy runtime-da tətbiq olunur. MFA challenge və CIDR allowlist enforcement bu release-də mövcud deyil; buna görə həmin flag-lər migration ilə söndürülür və Settings onları `Not configured` göstərir. Provider və tam deny/allow integration testi tamamlanmadan production təhlükəsizlik nəzarəti kimi təqdim edilməməlidir.

System Administrator texniki tenant administratorudur və default olaraq business signatory deyil. Bu hesab sənədləri approve/sign etmir, Casual Workforce vendor/invoice prosesini icra etmir, business report və employee mesajlarını açmır. Production smoke testdə ayrıca System Administrator hesabı ilə həmin modulların UI-da gizli və API-da `403` olması yoxlanılmalıdır.

## 10. Release sonrası smoke test

1. `https://hgi.hoterra.net` login səhifəsini açır.
2. Mövcud olmayan slug tenant məlumatını və login sessiyasını vermir.
3. HGI istifadəçisi login olur və başqa tenant token/header kombinasiyası 403 alır.
4. `api.hoterra.net/api/auth/login` tenant header olmadan `TENANT_REQUIRED` alır; `X-Tenant-Slug: hgi` ilə HGI login işləyir.
5. Sənəd upload/download yalnız autorizasiyalı istifadəçidə işləyir.
6. HoD yalnız öz departament request-lərini görür.
7. Workforce approval ardıcıllığı HoD → HR HoD → Finance Director → GM → Procurement işləyir.
8. Hər Workforce mərhələsində yalnız exact current actor Dashboard `My Work` task-ını və action düyməsini görür; Procurement selection, vendor correction, HOD evaluation/actuals və Finance completion task-ları deep-link ilə request-i açır.
9. Notification click serverdə owner + capability + object ACL yoxlamasından sonra düzgün request/document-i açır; silinmiş, revoked və ya scope-dan çıxmış target metadata sızdırmadan `Item unavailable` qaytarır.
10. Action notification qərardan əvvəl `AVAILABLE`, qərardan sonra timestamp-li `COMPLETED` olur; eyni document approval cycle/step notification-ı dedupe olunur və completed task read-only record-a gedir.
   - Workforce approval, Procurement confirmation/revision, Finance Director/GM vendor correction və HoD final evaluation eyni current-actor qaydasını tətbiq edir.
11. Document review submission HoD inbox və Dashboard `My Work`-də exact approval linki yaradır; hər approval növbəti Finance Director/GM signer notification-ını atomik yaradır; HoD return etdikdə yalnız author/owner Dashboard-unda `Revise and resubmit` görünür.
12. SMTP notification çatır və outbox `SENT` olur.
13. Backup yaradılır və restore prosedurunun sənədi əlçatandır.
14. Messages smoke test: ordinary `messages.use` user ümumi Users directory icazəsi olmadan yalnız aktiv message kontaktlarını görür; inaccessible document metadata-sı redaktə olunur; yeni participant köhnə shared-chat tarixçəsini unread kimi almır; deaktiv recipient-ə yeni DM göndərilmir.
15. Dashboard smoke test: `/api/dashboard/stats` `dashboard.view` tələb edir; document chart/activity yalnız `documents.read` actor üçün görünür; `My Work` exact document/workforce current actor task-larını açır və `/api/documents/stats` artıq mövcud deyil.
16. Search smoke test: Workforce request code/service/department query-si yalnız `workforce.read` və object-scope daxilində nəticə verir; HoD vendor təsdiqindən əvvəl vendor adını görmür; Procurement/Finance/GM icazəli mərhələdə vendor üzrə axtara bilir; response-da invite token və portal path yoxdur.
17. Identity privacy smoke test: `/api/auth/me`, `/api/users` və başqa istifadəçinin `/api/users/:id` response-larında `signatureImage`, tenant/storage path və raw relation sahələri yoxdur; `hasSignature` yalnız öz hesabına verilir. Document/signature totals yalnız `documents.read` və actor object scope-u daxilində görünür, audit/activity isə owner və ya `audit.read` ilə açılır.
18. User lifecycle smoke test: tamamlanmamış typed action taskı və ya `NEEDS_REVIEW` current-owner document-i (owner yoxdursa author document-i) olan istifadəçinin deactivate, role, custom-role və department scope dəyişiklikləri `409` alır; Edit User modalı eyni responsibility summary-ni göstərir. Eyni department HoD-larının revise edə bildiyi `RETURNED_FOR_REVISION` workforce request creator üzərindən yanlış blocker yaratmır. Tapşırıqlar business owner tərəfindən tamamlandıqdan/formal ötürüldükdən sonra lifecycle dəyişikliyi uğurlu olur və köhnə JWT tokenVersion ilə revoke edilir.
19. User directory responsive smoke test: `users.directory.read` olmayan user Users breadcrumb və directory control-larını görmür; custom-role filter base-role nəticələrinə qarışmır; 390px görünüşdə user kartları horizontal page overflow yaratmır, əsas View/Edit action-ları minimum 44px touch target-dir və Add/Edit modalı viewport daxilində scroll olunur. Scope xaricində profile deep-link təhlükəsiz unavailable state göstərir.
20. Custom-role recovery smoke test: role manager inactive custom rolları statusla görür, permission-ları dəyişə bilmir və auditli reactivation edə bilir; `roles.read`-only actor inactive rolları görmür. Inactive rola bağlı hər hansı active/inactive user qalarsa reactivation `409` ilə bloklanır. 390px görünüşdə permission matrisi horizontal table yox, minimum 44px touch target-li module kartlarıdır.
21. Organization scope smoke test: ordinary Employee/Supervisor `/api/departments` və department search-də yalnız öz department-ini alır; `documents.read.all`, `departments.manage` və user-provisioning actorları lazımi full directory-ni alır. System Administrator full user-assignment directory-ni görür, lakin `documents.read` olmadığı üçün heç bir business department detail-i aça bilmir. Listdə `canOpen=false` olan department business detail-ə linklənmir. Directory permission-i olmayan viewer team member adını görə bilər, amma profil deep-link və email almır. 390px Departments listi kartlarla işləyir, dead Filter yoxdur və detail API xətası explicit unavailable state göstərir.
22. Employee title smoke test: yeni user yaratmaq üçün 1–120 simvolluq `jobTitle` məcburidir; boş və həddən artıq uzun dəyər `400` alır. Title dəyişmək role/custom-role/capability-ni dəyişmir. `/api/auth/me`, user directory, department və profile eyni title-ı göstərir; yeni document imzası həmin title-ı evidence snapshot kimi saxlayır, sonrakı title dəyişikliyi köhnə imzanı dəyişmir.
23. Department lifecycle smoke test: department manager active/inactive directory-ni görür. Open user task, document/workforce process, active template/catalog dependency-si olan department deactivate edilmir. Dependency-lər həll ediləndən sonra aktiv staff seçilmiş başqa aktiv department-ə atomik köçürülür, köhnə department-chat access-i silinir və əvvəlki JWT-lər revoke edilir. Inactive department yeni account/document/template/Workforce assignment qəbul etmir; reactivation reason və audit evidence tələb edir. Historical documents və request-lər yerində qalır.
24. Records Management smoke test: `20260826140000_records_management` migration-dan sonra hər tenant üçün 7 illik default policy var və yeni cədvəllərdə `ENABLE/FORCE RLS` aktivdir. Archive policy-dən retention date alır; legal hold və vaxtı bitməmiş retention disposition-u `409` ilə bloklayır. Requester öz disposition request-ini approve edə bilmir. Fərqli `records.disposition.approve` actor approve etdikdə content/storage reference-ləri purge edilir, status `DISPOSED` olur, metadata/history/audit/request certificate saxlanılır. `node scripts/test-records-management-e2e.cjs` yalnız local PostgreSQL-də bu axını və fixture cleanup-ını yoxlayır.
25. Uploaded-file search smoke test: `20260826150000_document_search_index` və `20260826160000_attachment_search_index` migration-larından sonra `DocumentSearchIndex` üçün `FORCE RLS`, trigram GIN index və `(documentId, sourceKey)` uniqueness aktivdir. Primary və attachment TXT/CSV/PDF/DOCX/XLSX mətni yalnız həmin sənədi oxuya bilən actor üçün axtarılır; response extracted text və storage path qaytarmır. Şəkil və text layer-i olmayan PDF `OCR_REQUIRED`, köhnə DOC/XLS `UNSUPPORTED` göstərir. Review başladıqdan sonra primary və attachment file mutation `409` alır. System Administrator `Settings → System → Document Search Index Health` hissəsində yalnız tenant-a aid aggregate status saylarını görür; sənəd adı, fayl adı və extracted mətn göstərilmir. `Run pending batch`, `Retry failed` və `Full reindex` audit olunur; full reindex artıq saxta timestamp əməliyyatı deyil, real queue yaradır və ilk bounded batch-i dərhal işlədir. OCR/unsupported fayllar təsdiqlənmiş provider olmadan avtomatik üçüncü tərəfə göndərilmir. `npm run test:document-search-e2e` yalnız lokal API/PostgreSQL üzərində primary/attachment TXT, XLSX, PDF, primary-file replacement, admin health/retry və fixture cleanup axınını yoxlayır. Deploy-dən sonra bounded scheduler əvvəlki primary və attachment fayllarını batch-lərlə indeksləyir; loglarda `[document-index]` xətaları izlənilməlidir.
26. Upload trust-boundary smoke test: document, comment, message və reusable signature upload-larında client MIME authoritative deyil. Server fayl adını basename/NFKC/control-character qaydası ilə sanitizasiya edir, uzunluğu məhdudlaşdırır və MIME-i yalnız allowlist extension + real content signature-dan çıxarır. PDF header, DOC/XLS compound-file magic, DOCX/XLSX OOXML container marker-ləri, UTF-8 text/CSV və PNG/JPEG/WebP signature-ları uyğun gəlməsə fayl diskə yazılmadan `400` qaytarılır. Reusable signature yalnız real PNG/JPEG/WebP qəbul edir. Bu yoxlama antivirus/malware sandbox deyil; production object storage-a keçiddə ayrıca quarantine/scanner worker yenə tələb olunur.
27. Audit integrity smoke test: `20260826170000_tamper_evident_audit_log` migration-u mövcud tenant audit tarixçəsini ardıcıl `sequence`, `previousHash`, `entryHash` SHA-256 chain-inə keçirir. Insert trigger tenant advisory lock ilə yeni chain head yaradır; runtime DB rolundan `AuditLog UPDATE/DELETE` geri alınır və production startup bu privilege yenidən açılarsa fail-closed olur. Audit səhifəsinin özü `POST /api/audit/integrity` ilə access-event yazır və yalnız aggregate `VERIFIED/BROKEN`, count, sequence və anchor qaytarır. `npm run test:audit-integrity-e2e` yalnız lokal API/PostgreSQL-də temporary owner-level mutation edərək `VERIFIED → BROKEN → VERIFIED` detection və bərpanı yoxlayır. Database owner/migration credential-i break-glass səlahiyyətidir və runtime servisdə saxlanmamalıdır.
28. Audit evidence export smoke test: yalnız `audit.export` actor-u `GET /api/audit/export/evidence` ilə machine-verifiable JSON paket ala bilir və download özü chain-ə `DOWNLOAD` event-i kimi yazılır. Manifest canonical field order, U+001F separatoru, millisecond timestamp formatı, SHA-256 alqoritmi, verified chain head/anchor və filter/truncation statusunu göstərir. Export əvvəlcə chain head-i yoxlayır, sonra `sequence <= lastSequence` cutoff-u ilə eyni sübut nöqtəsini saxlayır; beləliklə paralel yeni event köhnə anchor altında paketə qarışmır. `npm run test:authorization-e2e` hər event hash-ini Node crypto ilə müstəqil yenidən hesablayır, full export-da sequence/previousHash davamlılığını və son hash-in manifest anchor-u ilə uyğunluğunu, adi əməkdaş üçün isə `403` sərhədini yoxlayır. Filterli və ya 10 000 event limitinə çatan paket manifestdə tam-chain export olmadığını açıq bildirir; uzunmüddətli WORM arxivə ötürülmə ayrıca deployment/integration mərhələsidir.
29. Request correlation smoke test: `20260826180000_audit_request_correlation` migration-u `AuditLog.requestId` və tenant-scoped index əlavə edir, mövcud chain-i v2 canonicalization altında yenidən hesablayır və insert trigger-i server request ID-ni hash evidence-ə daxil edir. API hər sorğu üçün caller-dən asılı olmayan UUID yaradır, `X-Request-Id` response header-i və structured HTTP/error log eyni ID-ni daşıyır; HTTP transaction daxilində yaradılan bütün audit event-lərinə Prisma infrastructure extension həmin ID-ni avtomatik əlavə edir. Background scheduler event-lərində request ID olmaması UI-da `Background` kimi göstərilir. Audit search/CSV/JSON evidence request ID-ni dəstəkləyir. `npm run test:authorization-e2e` integrity və evidence-download request header-lərinin chain event-lərində olduğunu və v2 hash-in müstəqil yenidən hesablandığını yoxlayır.
30. NAT/rate-limit and polling smoke test: API əvvəlcə `GLOBAL_IP_RATE_LIMIT_MAX` yüksək safety ceiling-i, sonra bearer token-in yalnız SHA-256 fingerprint-i ilə session-local `GLOBAL_RATE_LIMIT_MAX` bucket-i tətbiq edir. Raw JWT limiter yaddaşında və loglarda saxlanmır; saxta bearer rotation yalnız yüksək IP ceiling-ə qədər mümkündür, login və vendor public endpoint-lərinin daha sərt ayrıca limiter-ləri qalır. Bu model eyni hotel/NAT IP-si altındakı əməkdaşların bir-birinin normal session limitini doldurmasının qarşısını alır. Messages polling yalnız görünən browser tabında, overlap olmadan 10 saniyədə bir işləyir; `mark read` hər poll-da deyil, ilkin açılışda və real yeni incoming message olduqda göndərilir. `npm run test:authorization-e2e` ayrı bearer session-larının eyni remaining quota ilə müstəqil başladığını yoxlayır. Çox-instance deploy üçün Cloudflare/WAF və ya shared Redis limiter ayrıca edge/infrastructure qoruması kimi saxlanmalıdır.
31. Structured audit evidence smoke test: `20260826190000_structured_audit_evidence` migration-u `outcome`, `reason`, `beforeState` və `afterState` sahələrini əlavə edir və bütün tenant chain-lərini həmin sahələri qoruyan v3 canonical hash ilə yenidən qurur. Identity account, custom-role, Department create/update/lifecycle, Template create/update/archive/restore, Workflow create/update/activate/default/archive və Security Settings/maintenance dəyişiklikləri explicit allowlist projection-dan deterministik JSON snapshot yaradır; password/PIN/token/credential/API key, signature və storage path-ləri sanitizer tərəfindən evidence-dən çıxarılır. Department deactivate evidence-i səbəb, state transition, köçürülən aktiv user sayı və target department ID-ni ad/email sızdırmadan saxlayır. Template content və workflow definition audit snapshot-a açıq mətn kimi kopyalanmır: SHA-256 digest, ölçü/say, role/type xülasəsi və lifecycle metadata-sı exact dəyişiklik sübutunu saxlayır. Default workflow dəyişəndə əvvəlki və yeni default ID dəsti də evidence-ə daxil olur. Adi Audit Log/CSV snapshot məzmununu yaymır, yalnız structured diff mövcudluğunu göstərir; tam snapshot yalnız `audit.export` JSON evidence paketindədir. `npm run test:authorization-e2e` real cache-maintenance mutation-u üzrə request correlation, outcome/reason, parse edilən fərqli before/after state və v3 hash-i müstəqil yoxlayır. Digər business modullarında structured snapshot coverage və `DENIED`/`FAILURE` attempt event-ləri sonrakı mərhələdə genişləndirilməlidir; rollback olunan transaction-dan audit yazmaq üçün ayrıca təhlükəsiz attempt journal lazımdır.
32. Document structured evidence smoke test: create/update/review-submit, approval/return/reject, signature, primary-file upload/replacement, attachment upload, single/bulk archive, restore və new-version əməliyyatları transactional before/after + outcome/reason evidence yaradır. Document body, description, file name və storage path AuditLog-da clear text kimi təkrarlanmır; digest, ölçü, MIME, lifecycle metadata, version/cycle və signature placement evidence-i saxlanılır. Bulk archive hər document üçün ayrıca v3-chain event-i yaradır. Lokal Document/Records/Search/Workforce E2E cleanup-ları artıq `AuditLog.deleteMany` çağırmır; silinmiş fixture obyektlərinin evidence-i qalır, müvəqqəti Workforce actor/rolları isə FK və actor trace üçün inactive saxlanılır. E2E ardıcıllığı Document Notifications, Records, Search, tam Workforce lifecycle, authorization hash recomputation və tamper detection-dan sonra da chain-i `VERIFIED` saxlamalıdır.
33. Workforce core structured evidence smoke test: request create/revise-resubmit, HoD/HR/Finance Director/GM approval advancement, lowest-approved-rate auto-selection, Procurement confirmation/vendor dispatch, vendor-correction draft/submission/Finance Director/GM decision və unchanged-vendor finalization transactional `outcome`, `reason`, `beforeState` və `afterState` yaradır. Projection request/item/vendor/rate/status/cost ID və məbləğlərini saxlayır; request və correction şərhlərini açıq mətn kimi kopyalamır, yalnız length/presence/SHA-256 digest saxlayır. Vendor contact email-i, email body-si, portal linki və invite token heç vaxt structured snapshot-a daxil edilmir. Tam Workforce E2E correction + dispatch + completion axınından sonra audit chain yenə `VERIFIED` qalmalıdır.
34. Workforce operational/configuration evidence smoke test: delivered actuals, HoD confirmation, Finance completion, invoice create/match/pay, position/vendor/rate catalog mutation, vendor approval/rejection, settings, reusable request templates, department approval routes və monthly budgets explicit before/after evidence yaradır. Invoice number, reconciliation notes, vendor email/phone/insurance notes, catalog requirements, template comments və rejection reason AuditLog-a açıq mətn kimi kopyalanmır; bounded presence/length/SHA-256 evidence-i saxlanılır. Vendor approval route rolları və IDs, rate/currency, invoice hours/amount/status, actuals və budget məbləğləri exact business evidence kimi saxlanılır. Cancellation, vendor public response, quality evaluation, lifecycle scheduler və report-export audit mutation-larının eyni coverage səviyyəsinə gətirilməsi növbəti mərhələdir.
