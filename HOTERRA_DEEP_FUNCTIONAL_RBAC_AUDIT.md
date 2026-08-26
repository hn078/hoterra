# HOTERRA — Dərin funksional, RBAC və məhsul auditi

**Audit tarixi:** 25 avqust 2026
**Əhatə:** Frontend, backend, PostgreSQL tenant izolyasiyası, document lifecycle, workflow/signature, Casual Workforce, users/roles, settings, dashboard, notifications, messages, search, reports, archive, audit log, mobile/accessibility və bazar müqayisəsi.
**Metod:** Repository üzrə read-only code audit, endpoint inventarı, izolyasiya olunmuş lokal PostgreSQL bazasında real rol/API testləri, Employee UI browser testi, mövcud test/typecheck nəticələri və rəsmi məhsul sənədləri ilə benchmark.
**Production məlumatı:** Dəyişdirilməyib. Real authorization sınaqları yalnız `hoterra_audit` adlı disposable lokal bazada aparılıb.

> **Remediation update — 26 avqust 2026:** Bu sənəd ilkin tapıntıların audit izini saxlayır. P0 tapıntıları capability engine, object-scope read/write modelləri, safe DTO-lar, transactional approval/signature guard-ları, Workforce scope və Favorites ACL ilə aradan qaldırılıb və regression testləri ilə qorunur. Son security hardening mərhələsində tətbiq olunmayan 2FA/CIDR flag-ləri fail-closed söndürülüb; System Administrator default business signatory olmaqdan çıxarılıb və yalnız texniki identity/role/settings/audit səlahiyyətləri saxlanılıb. Identity lifecycle artıq inactive user-ləri yalnız lifecycle manager directory-sində göstərir, activation/deactivation-da köhnə JWT-ləri revoke edir və son aktiv System Administrator-un deactivate/demote edilməsini transaction daxilində bloklayır. Document signature evidence exact version + approval cycle və real SHA-256 file/content digest-i ilə bağlanır; review başladıqdan sonra metadata və primary file mutation bloklanır, return/restore/new-version isə köhnə evidence-i cari approval üçün yararsız edir. Cari implementasiya statusunun əsas mənbəyi `docs/architecture/MODULAR_MONOLITH.md`, release gate isə `docs/PRODUCTION_READINESS.md`-dir.

---

## 1. İcraçı nəticə

HOTERRA-nın tenant izolyasiyası və Casual Workforce prosesinin biznes məntiqi yaxşı başlanğıcdır. Production üçün əsas bloklayıcı çatışmazlıq yeni ekranların azlığı deyil; **səlahiyyətlərin vahid və məcburi qaydada tətbiq edilməməsidir**.

Hazırda dörd ayrı “həqiqət mənbəyi” var:

1. `server/permissions.ts` daxilində göstərilən statik permission matrix;
2. `CustomRole.permissions` JSON-u;
3. backend route-larında ayrıca yazılmış baza-rol yoxlamaları;
4. frontend səhifə və düymələrində səpələnmiş və ya ümumiyyətlə olmayan visibility yoxlamaları.

Bu dörd mənbə bir-birinə uyğun deyil. Custom role matrix-i əsasən kosmetikdir; backend çox vaxt yalnız `user.role`-a baxır. Buna görə ekranda “Read yoxdur” göstərilən baza rolu endpointi istifadə edə bilər, “Full Access” verilmiş custom role isə real əlavə səlahiyyət qazanmaya bilər.

### Audit maturity göstəricisi

Bu cədvəl sertifikasiya balı deyil; düzəliş prioritetini göstərən audit göstəricisidir.

| Sahə | Hazırkı vəziyyət | Risk |
|---|---:|---|
| Tenant izolyasiyası | Güclü əsaslar | Aşağı–Orta |
| Authentication/session | Qismən | Yüksək |
| Backend authorization/RBAC | Parçalanmış | Kritik |
| Frontend visibility/route guard | Yox səviyyəsində | Yüksək |
| Document access və state integrity | Qüsurlu | Kritik |
| Signature/approval integrity | Qüsurlu | Kritik |
| Casual Workforce biznes axını | Funksional, lakin scope zəifdir | Yüksək |
| Dashboard/My Work | Generic, assignment-aware deyil | Yüksək |
| Notifications | Şəxsi scope yaxşı, action semantics yarımçıq | Orta–Yüksək |
| Search | Metadata-only və secret leak mövcuddur | Kritik |
| Archive/records management | Sadə status dəyişməsi | Yüksək |
| Audit log | Natamam və module-scope yoxdur | Yüksək |
| Reports | Scope və real-data bütövlüyü zəifdir | Yüksək |
| Mobile/accessibility | Responsive əsas var, əməliyyat UX-i yarımçıqdır | Orta |

### Ən vacib nəticə

**Yeni böyük modul əlavə etməzdən əvvəl deny-by-default capability engine və object-level scope tətbiq edilməlidir.** Əks halda yeni ekranlar eyni authorization boşluqlarını böyüdəcək.

---

## 2. Real testlə təsdiqlənmiş kritik ssenarilər

İzolyasiya olunmuş lokal bazada Employee, GM və System Administrator test hesabları ilə aşağıdakılar real HTTP sorğuları ilə yoxlanılıb:

| Ssenari | Nəticə | Gözlənilən |
|---|---:|---:|
| Employee `GET /api/roles` | `200` | `403` və ya məhdud role-directory DTO |
| Employee `GET /api/users` | `200` | Məhdud directory və ya `403` |
| Employee `GET /api/reports` | `403` | Düzgün backend deny; UI da gizlənməlidir |
| Employee `GET /api/settings` | `403` | Düzgün backend deny; UI da gizlənməlidir |
| Employee search user nəticəsi | `passwordHash`, `pinHash` daxil olmaqla bütün User field-ləri | Yalnız safe DTO |
| Employee başqa departament document detail | `403` | `403` — düzgündür |
| Eyni Employee həmin başqa departament documentinə `PATCH` | `200` | `403` |
| Eyni Employee başqa departament archived documentini restore | `200` | `403` |
| GM System Administrator-u deactivate | `200` | `403` |
| GM həmin System Administrator-u reactivate | `200` | `403` və ya ayrıca privileged workflow |

Browser testi ilə Employee hesabında aşağıdakılar birbaşa görünürdü:

- `Users & Roles`, `Manage Roles`, `Add User`;
- bütün user adları, email-ləri, rolları və departamentləri;
- tam System Administrator permission matrix-i;
- `Reports`, `Audit Log`, `Settings`, `Workflows`, `Archive` kimi admin menyuları;
- ~~başqa istifadəçilərin document activity-si Dashboard `Recent Activity` blokunda~~ — **həll edildi:** dashboard üçün broad published read audience-dan ayrı author/owner/department responsibility scope tətbiq olunur.

Mövcud 12 test və bütün TypeScript typecheck-lər keçir. Lakin test paketi rol × endpoint × object-scope neqativ matrisini əhatə etmir; buna görə yaşıl CI hazırkı authorization risklərini tutmur.

---

## 3. P0 — production üçün bloklayıcı tapıntılar

### P0-01 — Search API password və signing PIN hash-lərini qaytarır

**Sübut:** `server/routes/search.ts:48` User sorğusunda safe `select` yoxdur və nəticə raw şəkildə JSON-a daxil edilir.

**Təsir:** Tenant daxilində hər authenticated istifadəçi `passwordHash`, `pinHash`, `signatureImage`, `isActive` və daxili identifikatorları ala bilər. Bu offline password/PIN cracking və signature kompromisi riskidir.

**Dərhal düzəliş:**

- User üçün vahid `publicUserSelect`/DTO yaradılmalıdır;
- hash və digər secret field-lərin heç bir serializer-dan çıxmamasına regression testi yazılmalıdır;
- search endpointinə ayrıca `users.directory.read` capability-si və scope əlavə olunmalıdır;
- mövcud PIN/password-ların rotasiyası risk qiymətləndirilməsindən sonra aparılmalıdır.

### P0-02 — Document write IDOR və state-transition bypass

**Sübutlar:**

- create hər authenticated istifadəçiyə açıqdır və göndərilən `departmentId`, `ownerId`, `status` qəbul edilir: `server/routes/documents.ts:584-658`;
- patch object ACL yoxlamadan title/description/status/tarix/version dəyişir: `server/routes/documents.ts:679-716`;
- restore yalnız authenticated olmağı tələb edir: `server/routes/documents.ts:864-899`;
- version yaratmaq ACL yoxlamadan documenti `DRAFT` və unlocked edir: `server/routes/documents.ts:1094-1127`;
- HOD bulk archive supplied ID-ləri department ilə məhdudlaşdırmır: `server/routes/documents.ts:384-404`;
- related və comments read scope-ları da natamamdır: `server/routes/documents.ts:450-473`, `932-940`.

**Təsir:** İstifadəçi oxuya bilmədiyi sənədi ID-ni bildiyi halda dəyişə, restore edə və ya state machine-dən kənar mərhələyə keçirə bilər.

**Düzəliş:** Bütün write endpointləri əvvəlcə `authorizeDocument(user, action, document)` işlətməli; status client payload-dan qəbul edilməməli, yalnız server-side transition command-ları ilə dəyişməlidir.

### P0-03 — Custom role permission matrix faktiki authorization deyil

**Sübutlar:**

- `AuthUser` yalnız baza `role` saxlayır: `server/middleware/auth.ts:7-15`;
- `requireRoles` yalnız baza role baxır: `server/middleware/auth.ts:77-84`;
- custom role JSON-u yaradılır və UI-da göstərilir: `server/routes/roles.ts:62-75`;
- yalnız Procurement catalog helper-i xüsusi olaraq həmin matrisi oxuyur: `server/routes/workforce.ts:254-264`.

**Təsir:** Custom permission deaktiv edilsə də baza rolun gücü qalır; əksinə əlavə permission real səlahiyyət yaratmır. `isActive=false` custom role üçün də mərkəzi enforcement yoxdur.

**Düzəliş:** `/auth/me` effective capabilities qaytarmalı; frontend və backend eyni capability adlarından istifadə etməlidir. Object scope ayrıca qiymətləndirilməlidir.

### P0-04 — GM System Administrator hesabını idarə edə bilir

**Sübut:** `server/routes/users.ts:95-151`. Actor yalnız GM/System Admin olmalıdır; target hierarchy yoxlanmır. “Yeni rol System Administrator olmasın” yoxlaması mövcud administratorun parol resetini, downgrade və deactivation-u dayandırmır.

**Təsir:** GM texniki root hesabı ələ keçirə və ya tenantı adminsiz qoya bilər.

**Düzəliş:**

- actor-target privilege hierarchy;
- son aktiv System Administrator guard-ı;
- privileged dəyişiklik üçün re-auth/MFA;
- reason, before/after və high-severity audit;
- ideal halda dörd-göz prinsipi.

### P0-05 — Approve və Sign ayrı-ayrılıqda state-i irəli aparır

**Sübutlar:**

- `/approve` signature row yaratmadan statusu irəli aparır: `server/routes/documents.ts:720-863`;
- `/sign` də statusu ayrıca irəli aparır: `server/routes/documents.ts:475-581`;
- UI eyni addımda həm `Approve`, həm `Sign` göstərir: `src/pages/ApprovalReviewPage.tsx:554-587`;
- bulk approve signature-sız ilk seçilmiş sənədi approve edir: `src/pages/MyApprovalsPage.tsx:98-109`;
- “hash” real document/file SHA-256 deyil: `server/routes/documents.ts:524`;
- signer assignment/departament deyil, əsas role ilə seçilir: `server/lib/signatures.ts:26-50`;
- workflow designer document runtime-a bağlı deyil.

**Təsir:** İmza tələb olunan approval signature olmadan tamamlana bilər; in-flight workflow və signed version arasında cryptographic bağ zəifdir.

**Düzəliş:** Signature tələb olunan addım üçün atomik `Review & Sign`; konkret task/assignee; exact document version və file/content SHA-256; idempotent decision; immutable signature snapshot; workflow instance.

### P0-06 — Casual Workforce bütün non-HOD istifadəçilərə açıqdır

**Sübut:** `server/routes/workforce.ts:76-92` HOD olmayan istifadəçiyə default `true` qaytarır. List scope əsasən yalnız HOD üçün tətbiq olunur: `server/routes/workforce.ts:710-806`.

**Təsir:** Employee/Supervisor hotel üzrə requestlər, vendor/price, correction, evaluation və invoice metadata-sını görə bilər.

**Düzəliş:**

- Employee/Supervisor — yalnız öz yaratdığı, iştirak etdiyi və ya ona action təyin olunan request;
- HOD — öz departamenti;
- HR HOD/FD/GM — yalnız assigned/current step və müəyyən edilmiş oversight;
- Procurement — procurement mərhələləri və vendor kataloqu;
- System Admin — business data default deyil, yalnız audited break-glass.

### P0-07 — Favorites ACL bypass

**Sübut:** `server/routes/favorites.ts:21-47` favorite create və list zamanı `canViewDocument` tətbiq etmir.

**Təsir:** Bilinən document ID favorite edilərək sonradan metadata ilə alına bilər.

**Düzəliş:** Həm create, həm list/read zamanı document ACL və safe DTO.

---

## 4. Hazırkı rol modeli — real davranış

Bu cədvəl `server/permissions.ts`-də göstərilən niyyəti yox, faktiki backend/frontend davranışını ümumiləşdirir.

| Rol | Faktiki güc | Problem |
|---|---|---|
| System Administrator | Texniki və biznes modullarında tam-a yaxın giriş; document/workforce approval override | Texniki administrator business signatory olmamalıdır |
| General Manager | User/role lifecycle, bütün settings/slug/branding, workflow/template, hotel-wide docs/reports, business approvals | Near-root roldur; System Admin target hierarchy yoxdur |
| Finance Director | Bütün documentlər, tenant-wide audit/reports, geniş workforce görünürlüğü | Finance scope-dan artıq security/HR məlumatı görür |
| HOD | Department documentləri və workforce; lakin object write boşluqları; bütün user/role directory görünür | Başqa department objectlərinə IDOR; global directory artıqdır |
| Supervisor | Department docs; UI-da admin modulları; workforce helper-lərdə ziddiyyətli create niyyəti | Permission matrix və real route davranışı uyğun deyil |
| Employee | Department docs; bütün Users/Roles UI/API; search secret leak; bütün non-HOD workforce visibility | Least privilege pozulur |
| Custom Role | Əsasən baseRole nə edirsə onu edir; Procurement üçün bir xüsusi exception | Matrix doğru security boundary deyil |

### System Administrator və GM üçün düzgün ayrım

**System Administrator görməli/etməlidir:**

- tenant identity, MFA/SSO, users, roles, integrations, SMTP, storage, backup, license, security audit;
- tenant slug və texniki health;
- break-glass access yalnız ayrıca səbəb, MFA və auditlə.

**System Administrator default olaraq etməməlidir:**

- hotel biznes documentlərini HOD/FD/GM əvəzinə approve/sign;
- vendor seçmək və invoice approve/pay etmək;
- məzmunu ehtiyac olmadan oxumaq.

**GM görməli/etməlidir:**

- hotel-wide business dashboard və icazəli documentlər;
- final business approvals, escalation və executive reports;
- business branding/defaults;
- workforce üzrə final qərar və exception oversight.

**GM default olaraq etməməlidir:**

- System Administrator yaratmaq/deaktiv etmək/parolunu dəyişmək;
- security/SMTP/backup/license/IP restrictions/secrets idarə etmək;
- audit retention-i zəiflətmək;
- permanent records deletion-u təkbaşına etmək.

---

## 5. Tövsiyə olunan rol və capability modeli

### Tövsiyə olunan personajlar

| Persona | Görməli və etməlidir | Görməməli və etməməlidir |
|---|---|---|
| System Administrator | Identity, roles, SSO/MFA, integrations, security, storage, backup, tenant health | Default business approvals və confidential məzmun |
| General Manager | Property-wide business view, final approvals, executive reports, escalation | System Admin lifecycle, security secrets, təkbaşına purge |
| User Administrator / HR Admin | Adi user invite/create/deactivate, department/position assignment | Privileged role definition/assignment və unrelated content |
| Document Controller | Metadata, templates, controlled publication, versioning | User passwords və finance/vendor əməliyyatları |
| Records Manager | Retention, legal hold, disposition review, restore | Identity/secrets və business approval impersonation |
| Workflow Administrator | Workflow design/test/version | Öz dizayn etdiyi flow-u avtomatik approve etmək |
| Department HOD | Öz department documents, users directory, requests, approvals, reports | Global roles/settings və başqa department confidential data |
| Finance Director | Assigned finance approvals, budget, invoice, finance report | Users/roles, security audit, unrelated HR content |
| Procurement Workforce Manager | Vendor/rate CRUD, procurement review/correction/dispatch | Employee administration və unrelated documentlər |
| HR HOD | HR addımı, workforce compliance və HR department scope | Procurement/finance admin |
| Supervisor | Assigned/team docs və tasks | Global directory, roles, settings, records purge |
| Employee | Own/assigned/published docs, own actions/messages | Users/Roles, Audit, Settings, vendor prices, global reports |
| Auditor/Compliance | Read-only scoped audit və approved snapshots | Hər hansı mutation |
| Vendor/External signer | Yalnız explicit shared order/package, expiry ilə | Tenant UI, directory və digər vendorlar |

### CRUD matrix yerinə named capability

Tövsiyə olunan nümunələr:

```text
users.directory.read
users.create
users.deactivate
users.password.reset
roles.read
roles.manage
roles.assign.privileged
documents.create
documents.read.own
documents.read.assigned
documents.read.department
documents.read.hotel
documents.update.metadata
documents.submit
documents.review
documents.sign
documents.archive
documents.restore
records.disposition
workflows.design
workflows.publish
audit.read.business
audit.read.security
reports.read.department
reports.read.hotel
reports.export
settings.manage.branding
settings.manage.security
workforce.request.create
workforce.vendor.manage
workforce.procurement.confirm
workforce.invoice.register
workforce.invoice.approve
workforce.invoice.pay
```

Capability təkbaşına kifayət deyil. Hər object üçün `own`, `assigned`, `department`, `hotel`, `confidentiality`, `currentWorkflowStep`, `legalHold` kimi atributlar da qiymətləndirilməlidir.

### Arxitektura kontraktı

1. Backend deny-by-default policy engine;
2. `/auth/me` effective capabilities və scope-ları qaytarır;
3. Sidebar, route guard və button-lar həmin response-dan istifadə edir;
4. Bütün DB query-ləri policy-nin verdiyi `where` scope-u ilə qurulur;
5. Object mutation ayrıca current-state və relationship yoxlamasından keçir;
6. Eyni policy üçün unit və E2E test matrisi olur.

---

## 6. Modul-modul dərin audit

### 6.1 Authentication, session və tenant

**Müsbət:**

- JWT tenant claim-i request tenantı ilə yoxlanır: `server/middleware/auth.ts:41-46`;
- user hər requestdə DB-dən yenidən oxunur və inactive hesab bloklanır: `server/middleware/auth.ts:48-62`;
- tenant-scoped Prisma client və PostgreSQL RLS mövcuddur: `server/db.ts:92-139`;
- tenant relation integrity migration-ları var.

**Boşluqlar:**

- token localStorage-da saxlanılır: `src/lib/api.ts:33-42`;
- logout token revoke etmir;
- `enable2FA`, IP restrictions və auto logout əsasən display/persisted config-dir, runtime enforcement deyil;
- session inventory, remote revoke, device trust və recovery lifecycle yoxdur.

**Tövsiyə:** httpOnly secure SameSite cookie və ya qısa-lived access + rotating refresh; server-side session table; real MFA/WebAuthn/enterprise OIDC; deactivation zamanı bütün session-ların revoke-u.

### 6.2 Users, roles, departments və positions

**İcra vəziyyəti — 26 avqust 2026:** User directory və profile read modelləri artıq explicit DTO və actor scope istifadə edir. Reusable signature storage path-i login, directory, signature-upload və profile response-larından çıxarılıb; yalnız hesab sahibi `hasSignature` boolean-ı alır və signature faylını owner-only endpointdən oxuya bilir. Directory/profile document və signature sayları viewer-in `documentReadScope` sərhədində hesablanır, audit məlumatı owner və ya `audit.read` ilə məhdudlaşır, recent audit DTO-su `details`/`entityId` daşımır. UI document/audit/role tablarını və document totals sütununu capability-yə görə gizlədir. Custom role adı düzgün göstərilir; hardcoded “Assigned Workflows” nümunələri real əlaqə olmadığı üçün profil səhifəsindən çıxarılıb. Login/current-account və account-mutation nested department/custom-role obyektləri minimum explicit sahələrlə qaytarılır. Deactivation və role/custom-role/department scope dəyişiklikləri istifadəçinin tamamlanmamış typed action taskı və ya current owner (owner yoxdursa author) kimi qaytarılmış document məsuliyyəti varsa transaction daxilində `409` ilə bloklanır. Edit User modalı təhlükəsiz category counts göstərir və tasklar həll olunmadan scope dəyişən Save-i söndürür. `RETURNED_FOR_REVISION` workforce request creator-a eksklüziv deyil—səlahiyyətli department HoD-u onu revise edə bildiyi üçün yanlış blocker sayılmır. Texniki identity administratoruna business object-i özbaşına reassign etmək hüququ verilmir; business məsuliyyətinin tamamlanması/ötürülməsi separation-of-duties qaydasında qalır. Users səhifəsində işləməyən bulk-selection checkbox-ları çıxarılıb, base və custom role filterləri ayrılıb, telefonda horizontal cədvəl əvəzinə 44px action-lı user kartları göstərilir və Add/Edit modalı mobil bottom-sheet davranışı alıb. Scope xaricində profile deep-link artıq sonsuz `Loading` göstərmir, təhlükəsiz unavailable vəziyyətinə keçir və directory icazəsi olmayan istifadəçiyə Users breadcrumb-i göstərilmir. Custom-role deactivate lifecycle-ı real bərpa əməliyyatı ilə tamamlanıb: inactive rolları yalnız role manager görür, permission matrix read-only olur, reactivation transaction/audit daxilində aparılır və legacy assignee qalarsa gözlənilməz capability artımına qarşı bloklanır. Mobil Roles səhifəsi ayrıca permission kartları və 44px control-lar istifadə edir; `roles.read` olub `users.directory.read` olmayan actor-a işləməyən Users breadcrumb-i verilmir. Department directory də authoritative object scope tətbiq edir: ordinary Employee/Supervisor yalnız öz department-ini, hotel-wide document/organization və ya user-provisioning actorları isə lazım olan full directory-ni alır. Hər list DTO-su real `canOpen` daşıyır, buna görə texniki directory viewer business detail icazəsi olmadan dead link görmür. Departments mobil kart görünüşünə keçirilib, işləməyən Filter control-u çıxarılıb, detail profil linkləri user-directory capability-si ilə uyğunlaşdırılıb və API failure sonsuz loading əvəzinə təhlükəsiz unavailable state göstərir.

Daimi əməkdaşın təşkilati vəzifəsi artıq məcburi, tenant-scoped `User.jobTitle` sahəsidir; access rolu və custom role-dan ayrıca saxlanılır və heç bir authorization qərarında istifadə edilmir. Create/Edit User, directory, department və profil ekranları vəzifə ilə access rolunu ayrı göstərir. Yeni document imzaları qərar anındakı real `jobTitle`-ı immutable evidence snapshot-ına yazır; sonradan title dəyişməsi əvvəlki imzanı dəyişmir. `WorkforcePosition` isə vendor servis kataloqu olaraq qalır və əməkdaş vəzifəsi ilə qarışdırılmır.

Department lifecycle artıq hard-delete etmir. `isActive/deactivatedAt` ilə recoverable deactivate/reactivate tətbiq olunur; açıq əməkdaş tapşırığı, document approval/revision, Workforce request, aktiv document/Workforce template və ya catalog position varsa deaktivasiya atomik şəkildə bloklanır. Aktiv əməkdaşlar yalnız başqa aktiv departamentə eyni transaction daxilində köçürülür, köhnə department-chat üzvlüyü silinir, mövcud session-lar revoke edilir, bildiriş və audit evidence yaradılır. Inactive department tarixi records üçün oxuna bilir, lakin yeni user, document, template, Workforce request/route/budget/catalog/template assignment qəbul etmir. UI manager üçün active/inactive directory, dependency summary və mobil lifecycle modalı təqdim edir.

**Hazırkı problemlər:**

- `GET /users` və `GET /roles` bütün authenticated userlərə açıqdır;
- Users page hamıya `Manage Roles`, `Add User`, `Edit User` göstərir;
- users list yalnız active userləri qaytarır, buna görə deactivate edilmiş user UI-dan itir və reactivate lifecycle qırılır;
- list response `isActive` field-i seçmir, frontend status filtri mənasını itirir;
- user hard-delete yoxdur — bu düzgündür, amma reassignment/deactivation workflow-u yoxdur;
- custom role deactivate/delete yoxdur;
- department/position deactivate və dependency-aware transfer yarımçıqdır;
- GM System Admin target-ləri idarə edə bilir;
- signature image-i admin/GM başqa user üçün upload edə bilir.

**Düzgün lifecycle:**

1. Invite pending;
2. Active;
3. Suspended/locked;
4. Deactivation requested;
5. Open approvals/owned docs/recurring tasks reassigned;
6. Sessions revoked;
7. Deactivated, audit identity saxlanılır;
8. Reactivation ayrıca permission və reason ilə.

User “silinməməlidir”; personal data retention siyasətinə görə anonymization ayrıca records/privacy prosesi olmalıdır.

### 6.3 Documents

**Read scope:** Employee/Supervisor hazırda bütün department documentlərini, draftları da görə bilər. Finance Director bütün tenant documentlərini görür. Department-i olmayan non-privileged userdə `departmentId: undefined` filter-i silə bilər və tenant-wide list/stats göstərə bilər.

**Write scope:** P0-02-də göstərilən object ACL boşluqları var.

**UI:** Create, export, archive, edit və new version action-ları geniş göstərilir. `allowDownload` və `allowComments` toggle-ları endpointdə məcburi tətbiq edilmir.

**Düzgün model:**

- Draft: author + co-author + Document Controller;
- In review: assigned reviewers və read audience;
- Published: explicit audience (hotel/department/role/user);
- Confidential: ayrıca ACL;
- Locked signed version: metadata daxil olmaqla yalnız kontrollu change request;
- New version: köhnə signature-ları inherit etmir; yeni workflow instance yaradır.

### 6.4 Workflow, approvals və signature

Document `workflowId` saxlayır, amma runtime hard-coded HOD → Finance → GM status xəritəsinə əsaslanır. Designer-də Parallel/Condition/Read/Edit/Notify kimi addımlar görünür, lakin runtime onları icra etmir.

**Tövsiyə olunan entity-lər:**

- `WorkflowDefinitionVersion`;
- `WorkflowInstance`;
- `ApprovalTask` — assignee user/role/department, due date, delegation, status;
- `Decision` — approve/reject/return, comment, actor, reason;
- `SignatureEnvelope` — exact version hash, certificate/provider evidence;
- `EscalationEvent`.

Serial, parallel, quorum, conditional, delegation/out-of-office, SLA və “submitter özü approve edə bilməz” qaydaları olmalıdır.

### 6.5 Casual Workforce

**Güclü tərəflər:** multi-line request, HR/FD/GM route, vendor approval, lowest approved rate selection, Procurement correction review, vendor acceptance, actuals, evaluation, low-score alert, invoices və reports.

**Risklər:**

- non-HOD visibility tenant-wide;
- GM/System Admin bütün approval addımlarını override edə bilir;
- role name/baseRole üzrə xüsusi Procurement məntiqi parçalanıb;
- vendor response legacy internal endpointlə impersonate edilə bilər;
- actual cost client input-u ilə sərbəstdir;
- invoice matched olmadan paid edilə bilər;
- duplicate invoice/duplicate evaluation qoruması zəifdir;
- multi-vendor evaluation primary vendorla məhdud qala bilər;
- UI tab/action visibility role deyil, coarse qruplaşdırmadır.

**Əlavə olunmalı nəzarətlər:**

- vendor compliance document expiry;
- effective-dated/versioned rates, VAT/currency;
- capacity/availability;
- attendance/timesheet evidence;
- request → actuals → invoice three-way match;
- invoice dispute/credit note/partial payment;
- AP register və Finance approve/pay ayrımı;
- per-vendor/per-request-item evaluation uniqueness;
- PMS/HR/payroll/accounting integrations.

### 6.6 Dashboard — “overview” yox, “My Work” olmalıdır

**İcra vəziyyəti:** current-step document və Workforce approval-ları, yalnız author/owner üçün geri qaytarılmış document revision-ları, Procurement selection/correction, Finance/GM vendor review, HoD evaluation/service confirmation və Finance completion actor-scoped `My Work` aggregator-a əlavə edilib. Gecikmiş, revision tələb edən və yaxın tarixli task-lar prioritetləşdirilir; aşağıdakı geniş SLA/reminder kataloqunun qalan hissələri növbəti iterasiyalardır.

İlkin auditdə pending sayı current userin task-ını yox, ümumi statusları sayırdı; Recent Activity department/object ACL ilə scope olunmurdu. İndi bütün Dashboard document aggregate-ləri və Upcoming Reviews ayrıca responsibility scope istifadə edir, `My Work` isə current-step document/workforce və author/owner revision task-larını birləşdirir. Aşağıdakı daha geniş SLA və task kataloqu hələ növbəti mərhələdir.

**Modul və UI düzəlişi:** Dashboard read modeli Documents HTTP routerindən ayrılıb və Reporting moduluna uyğun ayrıca `/api/dashboard/stats` adapterinə keçirilib. `dashboard.view` olub `documents.read` olmayan custom rollar artıq boş document chart-ları, document deep-link-ləri və Recent Activity panelini görmür; Workforce `My Work` və icazəli quick action-lar müstəqil qalır. Department və upcoming-review query-ləri minimum field projection istifadə edir.

**Role-aware My Work:**

- Employee: my drafts, returned changes, assigned/read acknowledgement;
- HOD: department document approval, workforce request, overdue review, evaluation;
- HR HOD: HR workforce step, onboarding/deactivation tasks;
- Finance Director: finance approvals, budget exception, vendor correction, invoice exception;
- Procurement: GM-confirmed requests, vendor response, correction, expiring compliance;
- GM: final approvals, escalations, budget variance, high-risk vendor alerts;
- System Admin: failed email, storage/backup, integration/security alerts, locked users.

Hər task row-u entity, expected action, due/overdue, SLA, assigned actor və deep link saxlamalıdır.

**Recent Activity qaydası:** öz activity-si + oxuya bildiyi objectlər + role-a görə department/tenant view. System Admin default business feed deyil.

### 6.7 Notifications

**Müsbət:** API notification-ları `userId` ilə scope edir; Header və Notifications page bütün row klikini vahid server-authoritative `open` əməliyyatına göndərir. Server capability allowlist-dən əlavə document/workforce object ACL-ni də authoritative read model ilə yenidən yoxlayır; uğurlu target exact task-a gedir, revoked/silinmiş/out-of-scope target isə metadata sızdırmadan `Item unavailable` olur.

**Problemlər:**

- ~~Notifications page kart klikində yalnız read olur; ayrıca kiçik link navigate edir~~ — **həll edildi:** bütün kart və header row vahid server-authoritative open kontraktından istifadə edir;
- ~~`workforce` type ayrıca tab/icon deyil~~ — **həll edildi:** ayrıca Workforce tab/icon mövcuddur;
- ~~ordinary user page global admin Settings endpointini preference kimi çağırır və `403` alır~~ — **həll edildi:** settings sorğusu və hotel-wide controls capability-gated-dir;
- ~~preference per-user deyil~~ — **həll edildi:** şəxsi email delivery preference ayrıca tenant-scoped `UserNotificationPreference` modelində saxlanılır, yalnız həmin user dəyişir və dəyişiklik audit olunur; actionable in-app task-lar mandatory qalır;
- ~~yalnız string URL saxlanılır; entity/action typed target yoxdur~~ — **mərhələli həll edildi:** schema `entityType`, `entityId`, `actionType`, `dedupeKey`, `expiresAt`, `actionCompletedAt` saxlayır; document/workforce/vendor/procurement/vendor-correction/final-evaluation action notification-ları typed evidence yazır, legacy informational notification-lar geriyə uyğun linklə işləyir;
- ~~next document approver həmişə notification almır~~ — **həll edildi:** initial submission və hər successful approval expected role/department + effective capability ilə növbəti signer notification-ını eyni transaction-da yaradır;
- ~~stale/completed/revoked target semantics yoxdur~~ — **həll edildi:** stale/revoked/out-of-scope target `UNAVAILABLE`, bitmiş typed approval action timestamp-li `COMPLETED` olur və read-only record-a gedir;
- document approval cycle/step deduplication əlavə edilib; geniş SLA reminder, digest və bütün notification növləri üzrə delivery status növbəti mərhələdir.

**Notification click kontraktı:**

1. Bütün row clickable;
2. Target authorization serverdə yoxlanır;
3. Uğurludursa mark-read + exact task-a navigation;
4. Task bitibsə “Completed by X at Y”;
5. Access itibsə metadata sızdırmadan “Item unavailable”;
6. Read state ilə action-completed state ayrı saxlanır;
7. `entityType`, `entityId`, `actionType`, `dedupeKey`, `expiresAt` saxlanır.

### 6.8 Messages

Direct, department və hotel-wide conversation modeli tenant və `messages.use` capability scope-u ilə işləyir.

- ~~Hotel/department chat-da başqa scope document metadata-sı recipient-ə sızırdı~~ — **həll edildi:** hər recipient üçün `canReadDocument` yenidən yoxlanır; icazəsiz attachment yalnız generic `Document` kimi göstərilir və document DTO qaytarılmır;
- ~~Header message click ümumi inbox-u açırdı~~ — **həll edildi:** actor-scoped conversation directory ilə yoxlanmış exact conversation deep-link açılır;
- ~~Direct-message picker ümumi Users directory icazəsindən asılı idi~~ — **həll edildi:** ayrıca tenant-scoped, minimum-field `/conversations/contacts` read modeli yalnız aktiv və effektiv `messages.use` icazəli kontaktları qaytarır;
- direct conversation create backend-də target-in aktivliyini və effective capability-sini təkrar yoxlayır; əvvəlki söhbətin tarixçəsi qorunur, amma deaktiv və ya Messages icazəsi götürülmüş recipient-ə yeni mesaj `409` ilə bloklanır;
- browser polling hidden tab-da dayanır, overlap etmir və 10 saniyə intervalı istifadə edir; selected conversation üçün hər poll-da boşuna `mark read` mutation-u göndərilmir, yalnız ilkin açılış və həqiqi yeni incoming message read acknowledgement yaradır;
- API rate limiting hotel NAT-ni tək actor kimi bloklamır: yüksək IP safety ceiling və raw token saxlamayan SHA-256 session bucket ayrıdır; login/vendor public axınlarının sərt ayrıca limitləri qalır;
- shared chat-a yeni qoşulan participant üçün unread sərhədi `lastReadAt ?? joinedAt`-dır; participant olmayan istifadəçiyə bütün tarixi mesajlar unread kimi yazılmır;
- attachment download conversation membership/department ACL və message-conversation əlaqəsini yenidən yoxlayır.

Növbəti məhsul mərhələsi: mention/reaction, message retention/legal hold, moderator controls və delivery/read receipts.

### 6.9 Search

**İcra vəziyyəti:** Global Search document, user, department, template, workflow və Casual Workforce nəticələrini hər modulun authoritative actor-scope read modeli ilə kompozisiya edir. User nəticəsi explicit secret-safe DTO-dur; document nəticəsi storage/content/signature daxili sahələrini qaytarmır. Custom rolun oxuya bilmədiyi tab və module filterləri UI-da göstərilmir.

Casual Workforce request kodu, department, service/position və icazə olduqda vendor adı ilə axtarılır. Nəticə `canViewWorkforceRequest` ilə son dəfə filter olunur; vendor adı Procurement təsdiqindən əvvəl HoD/ordinary actor-a açıqlanmır və bearer invite/token sahələri search DTO-da yoxdur. Search yalnız 50 lightweight candidate oxuyur və maksimum 10 workforce nəticəsi qaytarır. Sürətli query dəyişikliklərində stale cavabın yeni nəticəni overwrite etməsi sequence guard ilə bloklanıb.

Qalan boşluq: uploaded PDF/DOCX/XLSX/PPTX binary content extraction və OCR/index queue yoxdur. `content` filter yalnız bazada saxlanan document text/description üzərində işləyir.

**Target:** permission-trimmed PostgreSQL full-text/OCR, relevance/highlight, server-synced saved searches, index queue health və malware/quarantine status.

### 6.10 Reports

Backend document reports yalnız System Admin/GM/Finance üçün tenant-wide açıqdır; HOD permission matrix-də read/export görünsə də endpoint `403` verir. UI-da statik KPI müqayisələri, köhnə tarixlər və inert Filter/View/Download elementləri var.

**Target report families:**

- Personal/department operations;
- Executive hotel-wide;
- Finance/payables/budget;
- Procurement/vendor performance;
- Compliance/records/audit;
- Security/system health.

Hər report permission, row-level scope, PII redaction, export permission, generated-at və source freshness göstərməlidir.

### 6.11 Archive və records management

**İcra olunub (26 avqust 2026):** Archive actor/object scope-u saxlayan Records Management lifecycle-a keçirildi. Tenant/category üzrə aktiv retention policy arxiv zamanı avtomatik tətbiq edilir; hər record `retentionUntil` daşıyır. Legal hold disposition-u bloklayır və açıq disposition request-i ləğv edir. Retention dəyişməsi və restore da köhnə pending review-u bağlayır.

Birbaşa permanent-delete endpoint/UI action-ı çıxarılıb. Retention bitdikdən və legal hold olmadıqdan sonra səlahiyyətli şəxs disposition request yaradır; request-i yaradan user öz sorğusunu approve edə bilməz. Fərqli `records.disposition.approve` actor təsdiqləyəndə content və tenant-private document/comment faylları purge olunur, amma sənəd `DISPOSED` tombstone, request snapshot, history və audit evidence kimi qalır. Bu, four-eyes nəzarət və deletion certificate rolunu yerinə yetirir.

Qalan maturity işi: event-triggered retention, policy version snapshot-u, bulk disposition queue, storage purge retry/alert worker və hüquqi siyasət üzrə ayrıca Records Manager təyinatı.

### 6.12 Audit Log

**İcra vəziyyəti:** Audit Log tenant-scoped PostgreSQL SHA-256 chain və monoton sequence ilə tamper-evident oldu. Runtime DB rolundan update/delete səlahiyyəti geri alınıb, trigger table owner olmayan mutation-u bloklayır və production startup səhv grantı fail-closed edir. Audit səhifəsinin açılması ayrıca `VIEW` evidence yazır; UI bütün chain-i yenidən hesablayan aggregate `VERIFIED/BROKEN` nəticəsini və anchor-u göstərir. Hər HTTP sorğusu server-generated UUID alır; response `X-Request-Id`, structured HTTP/error log və həmin async axındakı audit event-ləri eyni correlation ID-ni daşıyır. Caller öz ID-sini auditə yeridə bilmir. V3 SHA-256 payload request ID ilə yanaşı `outcome`, `reason`, `beforeState` və `afterState` sahələrini qoruyur. Identity account, custom-role, Department, Template, Workflow, Document və Security Settings/maintenance mutation-ları explicit allowlist + deterministik sanitizer ilə secret-sız structured snapshot yazır; department deactivation yalnız transfer count/target və state transition-u saxlayır. Template/document content, document description/file name/path və workflow definition clear-text çoğaldılmır, digest + ölçü/struktur/lifecycle xülasəsi ilə dəyişiklik sübut olunur. Document create/update/review, qərar, imza, upload, archive/restore/version və bulk archive coverage-i exact version/cycle evidence-i saxlayır; default workflow replacement köhnə/yeni ID dəstini saxlayır. Normal list/CSV snapshot məzmununu çıxarmır; `audit.export` hüquqlu JSON evidence paketi canonicalization contract, sabit verified chain cutoff-u, sequence/previousHash/entryHash/requestId və structured state-i verir. Real authorization E2E real maintenance mutation-u üzrə fərqli before/after, outcome/reason, correlation və bütün v3 hash-ləri müstəqil Node crypto ilə yoxlayır. Lokal tamper E2E `VERIFIED → BROKEN → VERIFIED` detection-u sübut edir. Migration/table owner offline break-glass olaraq qalır.

Əsas user/role/department/template/workflow, document, vendor/rate, Workforce və invoice mutation-ları application service transaction-larında audit olunur. Verifiable off-platform transfer və request correlation hazırdır; user/role/department/template/workflow/document/security mutation-larında structured before/after + outcome/reason tətbiq edilib. Qalan maturity işi bu structured contract-ı Workforce/Records/Messaging kimi digər business modullarına yaymaq, rollback-dan asılı olmayan `DENIED`/`FAILURE` attempt journal yaratmaq və export paketlərini uzunmüddətli WORM storage-a avtomatik ötürmək/retention tətbiq etməkdir.

**Target audit field-ləri:** actor, effective role/capabilities, impersonation/break-glass, tenant, request/correlation ID, object/version, before/after, outcome, reason, source IP/device, timestamp, integrity hash.

Business/security/identity/records/system audit read permission-larının daha granular ayrılması və off-platform WORM retention növbəti compliance mərhələsidir.

### 6.13 Settings

Base permission matrix ilə backend ziddir: GM Settings üçün read/export göstərilir, amma backend ona bütün settings, branding və tenant slug/name dəyişmək hüququ verir.

Bir çox toggle yalnız saxlanılır/göstərilir: real 2FA, IP restriction, auto logout, backup, signature policy, search reindex və s. runtime nəzarətinə çevrilməyib. “Enabled” etiketi protection sübutu deyil.

**Settings ownership:**

- Personal preferences — hər user;
- Branding/business defaults — GM/Brand Admin;
- Document defaults — Document Controller;
- Workforce settings — Procurement/Workforce Admin;
- Identity/security/integrations/SMTP/storage/license/maintenance — System Admin;
- Retention/legal hold — Records Manager, change approval ilə.

### 6.14 Mobile və accessibility

Responsive layout əsasları var, amma təxminən 90 `alert()`, 3 `confirm()` və 7 `prompt()` browser dialog-u əməliyyat UX-ini zəiflədir. Signing PIN native prompt ilə alınır. Çoxlu geniş admin table yalnız horizontal scroll edir. Custom modallarda dialog semantics, focus trap/restore və Escape handling ardıcıl deyil.

**Target:** common accessible modal/toast/confirmation; 44px touch target; mobile card/detail table pattern; inline validation; PIN üçün secure re-auth modal; Messages/My Work mobile navigation; keyboard və screen-reader testləri.

---

## 7. Bazar və best-practice müqayisəsi

### Authorization və object ACL

- OWASP least privilege, deny-by-default və hər requestdə authorization yoxlamasını tövsiyə edir: [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).
- M-Files object permission-larında read/edit/delete/change-permission ayrılır və read hüququ olmayan object search/view-lərdə görünmür: [M-Files object permissions](https://userguide.m-files.com/user-guide/latest/eng/object_permissions.html).
- DocuWare organization functions, roles və file-cabinet profiles-i ayırır: [DocuWare user administration](https://knowledgecenter.docuware.com/docs/en/user-administration).

### Workflow və signature

- DocuWare user/role assignment, substitution, parallel task, conditional route və timed delay dəstəkləyir: [Workflow Designer](https://knowledgecenter.docuware.com/docs/workflow-designer-desktop-app-introduction), [Workflow activities](https://knowledgecenter.docuware.com/help/docs/webbased-workflow-designer-activities).
- Electronic signature flow signer authentication, document binding və certificate evidence tələb edir: [DocuWare electronic signatures](https://knowledgecenter.docuware.com/docs/how-electronic-signatures-work-in-docuware).

### Records və audit

- Microsoft Purview retention label, disposition review, deletion proof və regulatory records verir: [Purview Records Management](https://learn.microsoft.com/en-us/purview/records-management).
- Audit retention və export ayrıdır: [Microsoft Purview Audit](https://learn.microsoft.com/en-us/purview/audit-solutions-overview).
- DocuWare audit reports display/print, metadata old/new values, config və auth hadisələrini ayrıca qeyd edir: [DocuWare Audit Reports](https://knowledgecenter.docuware.com/audit-reports).

### Search/OCR

- M-Files metadata və file content search, Boolean/property filters verir: [M-Files Quick Search](https://userguide.m-files.com/user-guide/latest/eng/using_quick_search.html).
- Scan olunmuş faylları searchable PDF etmək üçün OCR dəstəyi var: [M-Files OCR](https://userguide.m-files.com/user-guide/latest/eng/scanning_and_text_recognition.html).

### Hotel operations və workforce

- Unifocus personalized role-aware home screen, priority actions, labor risk və budget-vs-actual yanaşmasını təqdim edir: [Unifocus Labor Management](https://www.unifocus.com/en/labor-management-system).
- hotelkit mobile checklist, shift handover, task, repair, walkthrough və centrally documented standards-i birləşdirir: [hotelkit Radisson Operations App](https://clients.hotelkit.net/radisson/radisson-operations-app/).
- Actabl/Alice cross-department task, housekeeping, maintenance və operational analytics təqdim edir: [Alice by Actabl](https://actabl.com/alice/), [Actabl Operations](https://actabl.com/operations-software/).

HOTERRA hazırda DMS + approvals + Casual Workforce kimi fərqlənir. Shift handover, maintenance/work orders və service recovery kimi hotel operations modulları authorization/records bazası düzəldildikdən sonra əlavə olunmalıdır.

---

## 8. Prioritet roadmap

### 0–48 saat: security hotfix

1. Search User safe DTO — hash/PIN leak bağlansın;
2. document patch/restore/version/archive/export/comments/related/favorites object guard;
3. GM → System Administrator target hierarchy;
4. Employee/Supervisor workforce visibility scope;
5. raw user signature image access məhdudlaşdırılsın;
6. secrets exposure üçün regression tests;
7. production log-larında mümkün access araşdırılsın.

### 1–2 həftə: authorization foundation

1. Named capability registry;
2. effective capability resolver;
3. query scope builders;
4. backend `authorize()` middleware/service;
5. frontend `ProtectedRoute`, nav/action filtering;
6. custom role real enforcement;
7. actor-target hierarchy və last-admin protection;
8. endpoint × role × own/department/other test matrisi.

### 3–6 həftə: workflow və personal work queue

1. Versioned workflow instance və ApprovalTask;
2. atomic Review & Sign;
3. assignment/delegation/SLA/escalation;
4. Dashboard `My Work` aggregator;
5. typed notification targets və unified click behavior;
6. per-user notification preferences;
7. user deactivation/reassignment workflow;
8. central audit service və before/after diff.

### 6–12 həftə: records və operational maturity

1. Retention/legal hold/disposition-un event-based policy, bulk queue və purge-retry ilə dərinləşdirilməsi;
2. OCR/full-text security-trimmed search;
3. real MFA/SSO və session management;
4. role-scoped real reports/scheduled exports;
5. vendor compliance, timesheet və three-way invoice matching;
6. accessible modal/toast/mobile table redesign;
7. external guest/signing lifecycle.

### Sonrakı mərhələ

- PMS/HR/payroll/accounting integrations;
- occupancy-driven workforce forecast;
- shift handover/checklist/inspection/maintenance;
- portfolio analytics;
- AI classification/extraction yalnız ACL və audit tam olduqdan sonra.

---

## 9. Qəbul testləri

Hər protected endpoint üçün ən az aşağıdakı matris avtomatlaşdırılmalıdır:

```text
roles: Employee, Supervisor, HOD, HR HOD, Finance, Procurement,
       GM, System Admin, Custom Role, Auditor

objects: own, assigned, same department, other department,
         tenant-wide, confidential, archived, legal hold

actions: list, read, create, update, submit, approve, sign,
         export, archive, restore, delete/disposition
```

### Məcburi invariant-lar

- Unauthorized object list/search/export response-da görünmür;
- direct ID request də eyni qaydanı tətbiq edir;
- UI-da görünməyən action backenddə də `403` verir;
- custom role permission dəyişəndə active session növbəti requestdə yeni capability alır;
- deactivated user tokeni dərhal yararsız olur;
- GM System Admin targetini dəyişə bilmir;
- last active System Admin deactivate edilmir;
- signature tələb olunan addım signature-sız advance etmir;
- signature exact immutable version hash-i ilə bağlanır;
- completed notification action yenidən icra olunmur;
- audit hər privileged mutation üçün before/after, actor və outcome saxlayır;
- legal hold object restore/delete/disposition qaydalarını bloklayır;
- Employee search response-da secret field heç vaxt yoxdur.

---

## 10. Tövsiyə olunan icra sırası

Bu işi bir böyük, çətin-review olunan dəyişiklik kimi yox, aşağıdakı ayrı PR-larla etmək daha təhlükəsizdir:

1. **Emergency leaks & IDOR hotfix**;
2. **Capability engine + auth DTO**;
3. **Users/roles lifecycle & hierarchy**;
4. **Document ACL/state machine**;
5. **Workflow task + atomic signature**;
6. **Workforce scopes & finance segregation**;
7. **Frontend protected routes/actions**;
8. **My Work + notifications**;
9. **Audit/records/search/report maturity**;
10. **Accessibility/mobile polish**.

Ən düzgün növbəti addım P0 hotfix-ləri və capability engine üçün ayrıca implementation planı çıxarıb ilk iki PR-ı başlamaqdır.
