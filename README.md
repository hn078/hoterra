# HOTERRA Document Management System (HDMS)

Корпоративная платформа для гостиницы HOTERRA: управление документацией, согласованиями и (в дорожной карте) операционными процессами — включая Casual Workforce Management.

## Возможности MVP (Этап 1)

- Авторизация с JWT и RBAC (6 ролей)
- 11 департаментов отеля
- 9 категорий документов
- Полный жизненный цикл документа (статусы по ТЗ)
- Dashboard для General Manager
- Список документов с фильтрацией
- Создание документа (мастер, шаг 1)
- Просмотр документа с историей и подписями
- Настройки системы
- Журнал аудита (API)
- Windows desktop приложение (Electron)

## Модуль: Casual Workforce Management ✅ v1

Полноценный цикл заказа временного персонала — от заявки HOD до оплаты вендора. UI: `/workforce`. Детальное ТЗ: [`docs/CASUAL_WORKFORCE.md`](docs/CASUAL_WORKFORCE.md).

| Блок | Что входит |
|------|------------|
| Заявка | Отель, департамент, дата, смена, позиция, кол-во, комментарий |
| Позиции | Room Attendant, Waiter, Cook, Security и др. + свои |
| Вендоры | Утверждённый список или broadcast «первый подтвердивший» |
| Согласование | Настраиваемые маршруты по департаментам (HK / F&B / Engineering…) |
| Статусы | Pending → Approved / Rejected → Sent to Vendor → Vendor Accepted → Completed |
| Закрытие услуги | Факт (люди, часы, стоимость) + подтверждение HOD и Finance |
| Отчёты | По месяцам: департаменты, вендоры, отели, должности, стоимость, человеко-часы, Budget vs Actual |
| Контроль | Лимиты бюджета, запрет срочных заказов (&lt; X часов), push-уведомления, audit trail, шаблоны заявок, сверка с Payroll |

Переиспользует уже существующие в HDMS: департаменты, RBAC, workflow designer, уведомления, журнал аудита, отчёты.

## Технологии

| Компонент | Технология |
|-----------|------------|
| Desktop | Electron 36 |
| Frontend | React 19 + TypeScript + Tailwind CSS |
| Backend | Node.js + Express |
| Database | SQLite (Prisma ORM, готов к PostgreSQL) |
| Auth | JWT + bcrypt |

## Быстрый старт

```bash
# Установка зависимостей
npm install

# Инициализация базы данных
npx prisma migrate dev --name init
npm run db:seed

# Запуск в режиме разработки
npm run dev
```

## Демо-аккаунты

| Роль | Email | Пароль |
|------|-------|--------|
| General Manager | fuad.ahmadov@hoterra.az | password123 |
| HOD | nigar.rustamova@hoterra.az | password123 |
| Finance Director | elnur.mahmudov@hoterra.az | password123 |
| Employee | employee@hoterra.az | password123 |
| Admin | admin@hoterra.az | password123 |

PIN для подписи: `1234`

## Сборка для Windows

### Локально (на Windows)

```bash
npm run build:win
```

Установщик `.exe` появится в папке `release/`.

### Через GitHub (рекомендуется)

**Прямая ссылка на скачивание:**

https://github.com/hn078/hoterra/releases/latest

Скачайте файл `HOTERRA Document Management System Setup 1.0.2.exe` и запустите.

Альтернатива через Actions (нужен вход в GitHub):

https://github.com/hn078/hoterra/actions

## Устранение неполадок (Windows)

Если приложение не открывается, проверьте лог:

```
%APPDATA%\hoterra-hdms\hoterra.log
```

или

```
C:\Users\<ваш_пользователь>\AppData\Roaming\hoterra-hdms\hoterra.log
```

После v1.0.1 при ошибке также показывается окно с текстом проблемы.

## Дорожная карта

- **Этап 1** ✅ — Авторизация, роли, департаменты, документы
- **Этап 2** — Шаблоны, маршруты, электронные подписи
- **Этап 3** — История, версии, поиск, архив
- **Этап 4** — Dashboard analytics, уведомления
- **Этап 5** — Интеграции (Opera PMS, M365, AD)
- **Этап 6** ✅ — Casual Workforce Management (заявки, вендоры, портал, recurring, payroll, отчёты CSV)

## Брендинг

- Primary Navy: `#0D1B2A`
- Accent Gold: `#D4A017`
- Steel Blue: `#294660`
- Font: Montserrat
