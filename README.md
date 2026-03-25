# VPN Telegram Bot MVP

Telegram-бот для выдачи персонального VPN/VLESS-конфига, показа статуса доступа и базового управления клиентами через админ-команды.

## Стек

- Node.js
- TypeScript
- grammY
- Prisma
- SQLite
- dotenv
- pino
- Docker Compose

## Возможности MVP

- пользовательские команды: `/start`, `/config`, `/status`, `/help`, `/contact`
- inline-кнопки главного меню
- проверка доступа по `telegram_id`
- статусы доступа: `ACTIVE`, `EXPIRED`, `DISABLED`
- админ-команды: `/admin`, `/adduser`, `/setexpiry`, `/disable`, `/enable`, `/listusers`, `/userinfo`
- аудит админ-действий в таблице `AuditLog`
- Docker-запуск одним контейнером
- тестовый seed для локальной проверки

## Подготовка

1. Создайте `.env` на основе [.env.example](D:\PROJECTS\VPN\.env.example).
2. Установите зависимости:

```bash
npm install
```

3. Сгенерируйте Prisma client:

```bash
npm run prisma:generate
```

4. Если база ещё не создана, подготовьте SQLite-файл и схему.

В проекте уже есть стартовая миграция в [prisma/migrations/20260325195000_init/migration.sql](D:\PROJECTS\VPN\prisma\migrations\20260325195000_init\migration.sql).

Основные переменные окружения:

- `BOT_TOKEN` - токен Telegram-бота
- `ADMIN_TELEGRAM_ID` - Telegram ID администратора
- `SUPPORT_LINK` - ссылка на администратора в Telegram
- `HELP_LINK` - ссылка на подробную инструкцию, открывается кнопкой `Инструкция`

## Локальный запуск

Режим разработки:

```bash
npm run dev
```

Продакшн-сборка:

```bash
npm run build
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

Важно:

- запускайте только один экземпляр бота с одним `BOT_TOKEN`
- база `./prisma/dev.db` монтируется в контейнер как `/app/prisma/dev.db`
- перед переходом на Docker остановите локальный `npm run dev`

## Тестовые данные

Для быстрого наполнения базы тестовыми пользователями:

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

## Формат админ-команд

`/adduser <telegram_id> <full_name> <display_name> <email_label> <uuid> <vless_url> <server> <port> <public_key> <short_id> <sni> <flow> [expires_at_iso]`

`/setexpiry <telegram_id> <YYYY-MM-DD|none>`

`/disable <telegram_id>`

`/enable <telegram_id>`

`/userinfo <telegram_id>`

Если в имени нужны пробелы, в текущем MVP используйте `_`.

## Структура

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
- если нужен полностью управляемый production-сценарий, следующий шаг после MVP: нормальные миграции Prisma без ручного SQL, healthcheck и внешний process manager
