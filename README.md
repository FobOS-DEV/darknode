# VPN Telegram Bot MVP

[![CI](https://github.com/FobOS-DEV/darknode/actions/workflows/ci.yml/badge.svg)](https://github.com/FobOS-DEV/darknode/actions/workflows/ci.yml)
[![Docker Publish](https://github.com/FobOS-DEV/darknode/actions/workflows/publish-ghcr.yml/badge.svg)](https://github.com/FobOS-DEV/darknode/actions/workflows/publish-ghcr.yml)

Telegram-бот для выдачи персонального VPN/VLESS-конфига, показа статуса доступа и базового управления клиентами через админ-команды.

## Возможности

- пользовательские команды: `/start`, `/config`, `/status`, `/help`, `/contact`
- главное меню с inline-кнопками
- выдача персонального VLESS-конфига только владельцу Telegram ID
- выдача текстового конфига и QR-кода для быстрого импорта
- статусы доступа: `ACTIVE`, `EXPIRED`, `DISABLED`
- админские сценарии через команды и inline-меню
- SQLite + Prisma
- Docker Compose для локального запуска
- GHCR image для серверного деплоя
- автоматические напоминания об истечении доступа

## Стек

- Node.js
- TypeScript
- grammY
- Prisma
- SQLite
- pino
- Docker Compose

## Переменные окружения

Создайте `.env` на основе `.env.example`.

Основные переменные:

- `BOT_TOKEN` — токен Telegram-бота
- `ADMIN_TELEGRAM_ID` — Telegram ID администратора
- `ADMIN_USERNAME` — username администратора
- `DATABASE_URL` — SQLite URL, по умолчанию `file:./prisma/dev.db`
- `HELP_LINK` — ссылка на инструкцию по подключению
- `SUPPORT_LINK` — ссылка на администратора в Telegram
- `REMINDER_DAYS` — через запятую дни до истечения, когда слать напоминания
- `REMINDER_INTERVAL_SECONDS` — интервал цикла reminder-сервиса в секундах
- `TZ` — таймзона

## Локальный запуск

Установка зависимостей:

```bash
npm install
```

Генерация Prisma client:

```bash
npm run prisma:generate
```

Запуск в dev-режиме:

```bash
npm run dev
```

Сборка:

```bash
npm run build
```

Запуск собранной версии:

```bash
npm run start
```

## Тесты

Запуск автоматических проверок:

```bash
npm test
```

Покрыты базовые сценарии:

- `active / expired / not_found`
- обновление срока действия
- disable / enable
- audit log для админских действий
- генерация QR-кода
- выборка и дедупликация reminder-сценариев

## Docker

Локальная сборка и запуск:

```bash
docker compose up --build -d
```

Логи бота:

```bash
docker compose logs -f bot
```

Логи reminder-сервиса:

```bash
docker compose logs -f reminders
```

Остановка:

```bash
docker compose down
```

Важно:

- не запускайте одновременно несколько экземпляров `bot` с одним и тем же `BOT_TOKEN`
- контейнер `bot` при старте сам выполняет `prisma migrate deploy`
- контейнер `reminders` отдельно запускает `npm run reminders:send` по циклу
- в image встроен Docker healthcheck для проверки SQLite и основных таблиц Prisma

## GHCR

Образы публикуются в GitHub Container Registry.

Примеры тегов:

```bash
ghcr.io/fobos-dev/darknode:latest
ghcr.io/fobos-dev/darknode:v0.1.1
```

## Серверный деплой

Для сервера используйте файлы из [deploy](D:\PROJECTS\VPN\deploy):

- [docker-compose.ghcr.yml](D:\PROJECTS\VPN\deploy\docker-compose.ghcr.yml)
- [.env.server.example](D:\PROJECTS\VPN\deploy\.env.server.example)
- [DEPLOY.md](D:\PROJECTS\VPN\deploy\DEPLOY.md)

Базовый сценарий:

```bash
docker login ghcr.io
docker compose -f deploy/docker-compose.ghcr.yml --env-file deploy/.env.server up -d
docker compose -f deploy/docker-compose.ghcr.yml logs -f bot
docker compose -f deploy/docker-compose.ghcr.yml logs -f reminders
```

Проверка состояния контейнеров:

```bash
docker compose -f deploy/docker-compose.ghcr.yml ps
```

## Тестовые данные

Быстрое наполнение базы:

```bash
npm run seed:test
```

Скрипт создаёт:

- активного пользователя на `ADMIN_TELEGRAM_ID`
- просроченного тестового пользователя `999000111`

После этого можно проверить:

- `/start`
- `/status`
- `/config`
- `/admin`

## Резервные копии

Локальный backup SQLite:

```bash
npm run backup:sqlite
```

Восстановление из backup:

```bash
npm run restore:sqlite -- .\backups\your-backup.db
```

Перед restore автоматически создаётся safety backup текущей базы.

## Напоминания

Разовый ручной запуск:

```bash
npm run reminders:send
```

Логика:

- выбираются только активные пользователи с `expiresAt`
- используются окна из `REMINDER_DAYS`
- повтор на тот же `user + expiresAt + daysBefore` не отправляется
- факт отправки сохраняется в `audit_logs`

## Админка

Доступно:

- `/admin`
- `/adduser`
- `/setexpiry`
- `/disable`
- `/enable`
- `/listusers`
- `/userinfo`
- `/cancel`

Inline-меню поддерживает:

- `Добавить`
- `Срок`
- `Отключить`
- `Включить`
- `Список`
- `Карточка`

## Структура проекта

```text
src/
  bot/
  config/
  constants/
  db/
  services/
  utils/
  index.ts
  reminders.ts
scripts/
  seed-test-data.js
  backup-sqlite.js
  restore-sqlite.js
prisma/
  schema.prisma
  migrations/
deploy/
  docker-compose.ghcr.yml
  .env.server.example
  DEPLOY.md
test/
  *.test.js
```

## Замечания

- `vless_url` и связанные поля считаются чувствительными данными
- доступ к админ-командам ограничен через `ADMIN_TELEGRAM_ID`
- резервные копии SQLite по умолчанию складываются в `./backups`
- для роста нагрузки следующим шагом логично вынести данные из SQLite в серверную СУБД
