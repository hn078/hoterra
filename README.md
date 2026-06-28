# HOTERRA Document Management System (HDMS)

Корпоративная система управления документацией для гостиницы HOTERRA.

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

### Через GitHub Actions (автоматически)

1. Загрузите код в GitHub репозиторий
2. GitHub Actions соберёт `.exe` на Windows-сервере
3. Скачайте файл из **Actions → Build Windows EXE → Artifacts → HOTERRA-HDMS-Windows**

Для ручного запуска сборки: **Actions → Build Windows EXE → Run workflow**

После ручного запуска также создаётся GitHub Release с установщиком.

## Этапы разработки

- **Этап 1** ✅ — Авторизация, роли, департаменты, документы
- **Этап 2** — Шаблоны, маршруты, электронные подписи
- **Этап 3** — История, версии, поиск, архив
- **Этап 4** — Dashboard analytics, уведомления
- **Этап 5** — Интеграции (Opera PMS, M365, AD)

## Брендинг

- Primary Navy: `#0D1B2A`
- Accent Gold: `#D4A017`
- Steel Blue: `#294660`
- Font: Montserrat
