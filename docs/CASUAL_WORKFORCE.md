# Casual Workforce Management — Product Spec

Планируемый модуль HOTERRA: заказ и контроль временного (casual) персонала через утверждённых вендоров. Цель — закрыть процесс от заявки до оплаты и заменить Excel + email.

**Статус:** implemented (complete)  
**Маршрут UI:** `/workforce`, `/workforce/:id`, `/vendor/order/:token`  
**API:** `/api/workforce/*`, `/api/vendor/*`  
**Модуль прав:** `Casual Workforce`

---

## Почему в HOTERRA

В HDMS уже есть каркас, на который модуль опирается:

- департаменты отеля и роли (HOD, Finance, GM, Admin);
- настраиваемые маршруты согласования (Workflows);
- уведомления и audit log;
- отчёты / dashboard.

Casual Workforce — отдельный операционный модуль (не категория документов), рядом с Departments / Users & Roles.

---

## 1. Создание заявки

Инициатор (например, HOD) создаёт заявку и выбирает:

| Поле | Описание |
|------|----------|
| Отель | Для multi-property; сейчас — HOTERRA |
| Департамент | Из справочника департаментов |
| Дата | Дата выхода персонала |
| Смена | Утро / вечер / ночь **или** время начала и окончания |
| Позиция | Из справочника (см. §2) |
| Количество | Число сотрудников |
| Комментарий | Свободный текст |
| Вендор | Выбранный из списка **или** режим broadcast (§3) |

---

## 2. Позиции (справочник)

Базовый список (расширяемый, в т.ч. «Другие» с добавлением своих):

- Room Attendant  
- Public Area Attendant  
- Steward  
- Waiter / Waitress  
- Banquet Waiter  
- Bartender  
- Cook  
- Kitchen Helper  
- Bellman  
- Porter  
- Houseman  
- Laundry Attendant  
- Technician  
- Security Officer  
- Receptionist  
- Concierge  
- Spa Therapist  
- Lifeguard  
- Driver  
- Other (custom)

Админ / HR может добавлять, архивировать и переименовывать позиции.

---

## 3. Выбор вендора (Vendor)

Из заранее утверждённого списка (Vendor A / B / C …).

**Режимы:**

1. **Direct** — заявка уходит выбранному вендору после финального утверждения.  
2. **Broadcast** — запрос нескольким вендорам; первый подтвердивший получает заказ (остальным — cancel / lost).

---

## 4. Маршрут согласования (настраиваемый)

Для каждого департамента — свой chain of approvers. Примеры:

| Департамент | Пример маршрута |
|-------------|-----------------|
| Housekeeping | Executive Housekeeper → HR → Financial Controller → GM |
| F&B | Restaurant Manager → F&B Director → FC → GM |
| Engineering | Chief Engineer → FC → GM |

Реализация опирается на существующий Workflow Designer: шаги по ролям / пользователям / должностям, ветвление при превышении бюджета (§8).

---

## 5. Статусы заявки

После утверждения система отправляет заказ вендору и ведёт статусы:

| Статус | Смысл |
|--------|--------|
| `Pending` | На согласовании |
| `Approved` | Внутренне утверждено |
| `Rejected` | Отклонено |
| `Sent to Vendor` | Заказ отправлен вендору |
| `Vendor Accepted` | Вендор подтвердил |
| `Completed` | Услуга оказана и закрыта |

Дополнительно (рекомендуется): `Vendor Declined`, `Cancelled`, `Awaiting Extra Approval` (бюджет / срочность).

---

## 6. После оказания услуги

Закрытие заявки (timesheet / completion):

- фактическое количество сотрудников;
- фактические часы;
- стоимость;
- подтверждение HOD;
- подтверждение Finance.

Только после обоих подтверждений статус → `Completed` (и данные попадают в отчёты / сверку с Payroll).

---

## 7. Отчёты (по месяцам)

Разрезы:

- по департаментам;
- по вендорам;
- по отелям;
- по должностям (позициям);
- по стоимости;
- по количеству человеко-часов;
- сравнение **Budget vs Actual**.

Экспорт CSV/PDF; фильтры по периоду, отелю, департаменту.

---

## 8. Контроль и расширения

| Функция | Поведение |
|---------|-----------|
| Лимиты бюджета | При превышении бюджета департамента по casual staff — доп. согласование GM или COO |
| Срочный заказ | Запрет заказа менее чем за X часов без специального разрешения (override-роль) |
| Push-уведомления | Всем текущим апруверам (in-app + email / позже push) |
| История действий | Кто создал, согласовал, отклонил и когда (через Audit Log + timeline заявки) |
| Шаблоны заявок | Например, «каждую пятницу — 5 официантов» (recurring / quick create) |
| Payroll | Сверка счетов вендора с фактическими часами/стоимостью (интеграция на Этапе 6+) |

---

## Сущности (черновик модели)

- `WorkforcePosition` — справочник должностей  
- `Vendor` — утверждённый поставщик  
- `WorkforceRequest` — заявка (+ hotel, department, date, shift, position, qty, comment, status)  
- `WorkforceRequestApproval` — шаги согласования (или reuse WorkflowInstance)  
- `WorkforceCompletion` — факт: headcount, hours, cost, HOD/Finance sign-off  
- `DepartmentCasualBudget` — лимит бюджета на период  
- `WorkforceRequestTemplate` — шаблоны / recurring  

---

## Этапы внедрения (внутри Этапа 6)

1. Справочники: позиции, вендоры, бюджеты, правила срочности  
2. CRUD заявок + настраиваемые approval routes по департаментам  
3. Отправка вендору (email/portal) + статусы Vendor Accepted  
4. Completion + подтверждения HOD / Finance  
5. Отчёты Budget vs Actual  
6. Шаблоны, broadcast-режим, Payroll-сверка  

---

## Реализовано в complete-релизе

- Magic-link портал вендора (`/vendor/order/:token`) + email outbox  
- Редактор маршрутов и бюджетов в UI  
- Multi-hotel (список в settings)  
- Recurring templates + hourly scheduler + «Run now»  
- Payroll: регистрация счёта → match vs actuals → paid  
- CSV export отчётов  
- Email + in-app уведомления апруверам  

## Вне скоупа (внешние системы)

- Реальная SMTP-доставка (сейчас outbox + console log; готов к SMTP)  
- Мобильное приложение для сотрудников вендора  
- Биометрия / контроль присутствия на объекте  
- Прямой коннектор к внешней Payroll/ERP (сверка внутри HOTERRA есть)  
