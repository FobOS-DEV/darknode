# VPN Telegram Bot MVP

[![CI](https://github.com/FobOS-DEV/darknode/actions/workflows/ci.yml/badge.svg)](https://github.com/FobOS-DEV/darknode/actions/workflows/ci.yml)
[![Docker Publish](https://github.com/FobOS-DEV/darknode/actions/workflows/publish-ghcr.yml/badge.svg)](https://github.com/FobOS-DEV/darknode/actions/workflows/publish-ghcr.yml)

Telegram-бот для выдачи персонального VPN/VLESS-конфига, показа статуса доступа и базового управления клиентами через админ-команды.

## Возможности

- пользовательские команды: `/start`, `/config`, `/status`, `/help`, `/contact`
- главное меню с inline-кнопками
- выдача персонального VLESS-конфига только владельцу Telegram ID
- статусы доступа: `ACTIVE`, `EXPIRED`, `DISABLED`
- админские сценарии через команды и inline-меню
- SQLite + Prisma
- Docker Compose для запуска одним контейнером

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
- `HELP_LINK` — ссылка на подробную инструкцию
- `SUPPORT_LINK` — ссылка на администратора в Telegram
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

## Docker

Сборка и запуск:

```bash
docker compose up --build -d
```

Логи:

```bash
docker compose logs -f bot
```

Остановка:

```bash
docker compose down
```

Важно: не запускайте одновременно несколько экземпляров бота с одним и тем же `BOT_TOKEN`.

## GHCR

Docker image будет публиковаться в GitHub Container Registry на теги релизов.

Ожидаемый адрес образа:

```bash
ghcr.io/fobos-dev/darknode:latest
ghcr.io/fobos-dev/darknode:v0.1.0
```

## Тестовые данные

Быстрое наполнение базы:

```bash
npm run seed:test
```

Скрипт создаёт:

- активного пользователя на `ADMIN_TELEGRAM_ID`
- просроченного тестового пользователя `999000111`

После этого можно сразу проверить:

- `/start`
- `/status`
- `/config`
- `/admin`

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

Админское меню поддерживает inline-кнопки:

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
scripts/
  seed-test-data.js
prisma/
  schema.prisma
  migrations/
```

## Замечания

- `vless_url` и связанные поля считаются чувствительными данными
- доступ к админ-командам ограничен через `ADMIN_TELEGRAM_ID`
- для production следующим шагом логично добавить healthcheck, нормальный rollout миграций и process manager
