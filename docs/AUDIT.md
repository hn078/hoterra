# HOTERRA HDMS — Functional Audit

Last updated: 2026-06-28 (DB wiring pass)

## Scope

Full audit of UI actions, API wiring, navigation, and design alignment against `docs/page-designs/*.png`.

**Deferred (external only):** Actual Microsoft/Google/Opera PMS/AD connection — toggles and config save in Settings → Integrations; SSO buttons show enable instructions.

**Этап 6:** Casual Workforce Management — requests, multi-hotel, dept route editor, budget/urgency, vendor email + magic-link portal, recurring templates, payroll match, email outbox, CSV export, HOD/Finance completion. Spec: [`CASUAL_WORKFORCE.md`](CASUAL_WORKFORCE.md).

---

## Database-backed features

| Area | Status | Notes |
|------|--------|-------|
| Auth (login/logout) | ✅ | JWT + bcrypt; logout in header dropdown |
| Dashboard stats/charts | ✅ | KPIs, status pie, dept bar, activity, trend, upcoming reviews from DB |
| Documents CRUD | ✅ | List, filter, tabs, pagination, export CSV |
| Document detail | ✅ | Tags, attachments, content, versions, archive with reason |
| Create document wizard | ✅ | content, workflowId, priority, file upload (base64) |
| Approvals | ✅ | Tab counts, priority from DB, approve/reject/request_changes |
| Approval review | ✅ | Comments from DB, post comments, workflow from signatures/history |
| Templates | ✅ | List/create/edit from DB |
| Departments | ✅ | List/detail from DB; create department |
| Users | ✅ | List/profile from DB; create user |
| Roles matrix | ✅ | `GET /api/roles` — user counts from DB |
| Workflows | ✅ | List/create/edit (steps JSON) |
| Search | ✅ | Full-text + server filters (dept, category, status, fileType) |
| Reports | ✅ | KPIs, trend, by category/dept, activity timeline from DB |
| Archive | ✅ | Archived docs from DB; restore, permanent delete, export |
| Audit log | ✅ | Paginated from DB; search/filter/export CSV |
| Notifications | ✅ | List, mark read, mark all read; prefs in SystemSettings |
| Settings | ✅ | General + notification prefs persisted |

---

## UI vs PNG mockups

Reference map: `docs/page-designs/README.md`

| Screen | Match | Gaps |
|--------|-------|------|
| Login | ~95% | SSO buttons decorative |
| Dashboard | ~95% | KPI counts from seed (not 287 docs) |
| Documents | ~95% | Filter dropdowns UI-only for some fields |
| Document detail | ~90% | PDF viewer is HTML preview, not real PDF render |
| Create document | ~90% | Rich-text toolbar decorative |
| My Approvals | ~95% | Bulk actions UI-only |
| Approval review | ~90% | E-sign deferred |
| Templates | ~95% | |
| Departments | ~95% | |
| Users / Roles | ~95% | Roles matrix read-only |
| Reports | ~90% | Some chart styling differs |
| Archive | ~95% | |
| Audit / Notifications / Search / Settings | ~90–95% | |

---

## Demo access

- URL: `http://localhost:5173`
- GM: `fuad.ahmadov@hoterra.az` / `password123`

```bash
npm run dev:server   # API :3001
npm run dev:vite     # UI :5173
npm run db:seed      # Reset demo data
```
