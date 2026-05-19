# VPN Telegram Bot MVP

[![CI](https://github.com/FobOS-DEV/darknode/actions/workflows/ci.yml/badge.svg)](https://github.com/FobOS-DEV/darknode/actions/workflows/ci.yml)
[![Docker Publish](https://github.com/FobOS-DEV/darknode/actions/workflows/publish-ghcr.yml/badge.svg)](https://github.com/FobOS-DEV/darknode/actions/workflows/publish-ghcr.yml)

Telegram-бот для выдачи персональной ссылки-подписки VLESS, мульти-инбаунд маршрутизации и базового управления клиентами через админ-команды. Архитектура устойчива к DPI-блокировкам: при компрометации одного инбаунда админ поднимает резервный и переключает трафик без перевыдачи конфигов клиентам.

## Возможности

- пользовательские команды: `/start`, `/config`, `/status`, `/help`, `/contact`
- главное меню с inline-кнопками
- выдача персональной subscription-ссылки только владельцу Telegram ID (`https://<domain>/sub/<token>`)
- subscription отдаёт base64-список `vless://` профилей по всем активным инбаундам (формат, который понимают Hiddify, v2rayN, NekoBox, Streisand, V2Box)
- QR-код subscription-ссылки для быстрого импорта в клиент
- статусы доступа: `ACTIVE`, `EXPIRED`, `DISABLED`
- мульти-инбаунд: статусы `ACTIVE` / `STANDBY` / `DEPRECATED` / `DISABLED`, sync через xray gRPC по каждому инбаунду
- админские сценарии через команды и inline-меню (включая `/inbounds`, `/rotatesub`)
- SQLite + Prisma
- Docker Compose с Caddy для авто-TLS (Let's Encrypt)
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

Subscription-ссылка и Caddy:

- `SUB_BASE_URL` — публичный URL подписки, обязательный (например `https://vpn.example.com`)
- `SUB_DOMAIN` — домен для Caddy, должен совпадать с host'ом из `SUB_BASE_URL`
- `SUB_HTTP_HOST` / `SUB_HTTP_PORT` — где слушает внутренний HTTP-сервер (по умолчанию `0.0.0.0:3001`, не публикуется наружу)
- `SUB_TLS_EMAIL` — email для уведомлений Let's Encrypt

Bootstrap первого инбаунда и xray sync читают эти переменные:

- `VPN_SERVER_HOST`, `VPN_SERVER_PORT`, `VPN_SNI`, `VPN_PUBLIC_KEY`, `VPN_SHORT_ID`, `VPN_FLOW`, `VPN_FINGERPRINT` — параметры исходного инбаунда. При первом старте бот создаст из них запись в таблице `Inbound` со статусом `ACTIVE`. После этого их можно править только через `/addinbound` и `/setinboundstatus`.
- `XRAY_INBOUND_TAG` — tag для bootstrap-инбаунда; должен совпадать с `tag` в `config.json` xray
- `XRAY_API_ADDRESS` — fallback gRPC-адрес, если у конкретного `Inbound` поле `xrayApiAddress` пустое
- `XRAY_SYNC_ENABLED`, `XRAY_HOT_SYNC_ENABLED` — включают/выключают gRPC-синк

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
- subscription: ok / disabled / revoked / not_found / STANDBY-skip / rotation
- inbound CRUD: create в STANDBY + audit, переходы статусов с/без `deprecatedAt`, list-порядок

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

Для сервера используйте файлы из [deploy](deploy):

- [docker-compose.ghcr.yml](deploy/docker-compose.ghcr.yml) — `bot`, `reminders`, `traffic-snapshots`, `caddy`
- [Caddyfile](deploy/Caddyfile) — конфиг reverse-proxy + автоматический Let's Encrypt
- [.env.server.example](deploy/.env.server.example)
- [DEPLOY.md](deploy/DEPLOY.md)

Подготовка перед `up -d`:

1. A-запись `SUB_DOMAIN → <server-ip>`.
2. Открыть `80/tcp`, `443/tcp`, `443/udp` на файрволле.
3. В `deploy/.env.server` прописать `SUB_BASE_URL`, `SUB_DOMAIN`, `SUB_TLS_EMAIL` и остальные `VPN_*` / `XRAY_*` переменные (как в `.env.server.example`).

Базовый сценарий:

```bash
docker login ghcr.io
docker compose -f deploy/docker-compose.ghcr.yml --env-file deploy/.env.server up -d
docker compose -f deploy/docker-compose.ghcr.yml logs -f bot
docker compose -f deploy/docker-compose.ghcr.yml logs -f caddy
docker compose -f deploy/docker-compose.ghcr.yml logs -f reminders
```

Проверка состояния контейнеров:

```bash
docker compose -f deploy/docker-compose.ghcr.yml ps
```

При первом старте `bot` идемпотентно:

- применяет миграции Prisma;
- создаёт первый `Inbound` из `VPN_*` / `XRAY_INBOUND_TAG` (статус `ACTIVE`, label `Default (env bootstrap)`);
- генерит `Subscription`-токены всем существующим пользователям;
- запускает HTTP-сервер подписок и (если включено) gRPC-sync на инстанс xray.

Caddy сам выпустит TLS-сертификат по `SUB_DOMAIN` при первом успешном HTTP-01 challenge — рестарта не требуется. Если сертификат не выпускается — проверьте логи `caddy` и достижимость порта 80 снаружи.

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

Управление пользователями:

- `/admin` — главное меню
- `/adduser` — ручное пошаговое добавление клиента
- `/setexpiry` — изменение срока действия
- `/disable`, `/enable` — выключить/включить клиента
- `/listusers`, `/userinfo` — списки и карточка пользователя
- `/cancel` — отменить активный сценарий

Управление инбаундами и подписками:

- `/inbounds` — список всех инбаундов с inline-картой каждого
- `/addinbound` — пошаговое добавление нового инбаунда (стартует в статусе `STANDBY`)
- `/setinboundstatus <id> <ACTIVE|STANDBY|DEPRECATED|DISABLED>` — переключение статуса; `DEPRECATED`/`DISABLED` вычищают пользователей из этого инбаунда через gRPC и пересинкают остальные `ACTIVE`
- `/rotatesub <telegram_id>` — перевыпустить subscription-токен (например, при утечке ссылки), новая ссылка отправляется пользователю в личку, старая отдаёт 404

Inline-меню поддерживает: `Заявки`, `Список`, `Импорт`, `Привязка`, `Срок`, `Карточка`, `Отключить`, `Включить`, `Инбаунды`, `Ручное добавление`.

### Типичный сценарий ротации при DPI-блокировке

1. `/addinbound` — заводишь новый инбаунд (другой порт/SNI/shortId/домен) в статусе `STANDBY`. Проверяешь подключение на тестовом клиенте через `vless://...` напрямую (без подписки).
2. На карточке инбаунда жмёшь `В работу` (`ACTIVE`). gRPC-sync разложит всех пользователей в новый xray-инбаунд.
3. На старом инбаунде жмёшь `Вывести из эксплуатации` (`DEPRECATED`). Пользователи остаются в подписке, но новый трафик идёт через резервный.
4. Клиенты на Hiddify / v2rayN обновят subscription автоматически в течение `Profile-Update-Interval` (12 часов) — рассылать ничего не нужно.

## Структура проекта

```text
src/
  bot/
    handlers/
      admin.ts
      inboundAdmin.ts
      config.ts
      ...
    keyboards/
    registerHandlers.ts
  config/
  constants/
  db/
  http/
    subscriptionServer.ts
  services/
    bootstrapService.ts
    inboundAdminService.ts
    subscriptionService.ts
    vpnService.ts
    xrayGrpcService.ts
    xraySyncService.ts
    ...
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
  Caddyfile
  DEPLOY.md
test/
  *.test.js
```

## Замечания

- subscription-токен считается чувствительным; при утечке используйте `/rotatesub <telegram_id>` — старая ссылка немедленно перестанет работать
- доступ к админ-командам ограничен через `ADMIN_TELEGRAM_ID`
- резервные копии SQLite по умолчанию складываются в `./backups`
- для роста нагрузки следующим шагом логично вынести данные из SQLite в серверную СУБД
- денормализованные поля `server/port/sni/publicKey/shortId/flow/vlessUrl` в `VpnClient` оставлены для совместимости и будут удалены отдельной миграцией после стабилизации архитектуры в проде
