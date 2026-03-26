# Server Deploy

## Files

Create these files on the server:

- `docker-compose.yml` from `deploy/docker-compose.ghcr.yml`
- `.env.server` from `deploy/.env.server.example`
- directory `prisma/` for the SQLite database
- directory `backups/` for SQLite backups

By default the compose file uses `ghcr.io/fobos-dev/darknode:latest`.
If you need a pinned rollout, replace it with a specific release tag.

## Login to GHCR

If the package is private:

```bash
docker login ghcr.io
```

Use your GitHub username and a token with package read access.

## Start

```bash
docker compose -f docker-compose.yml --env-file .env.server pull
docker compose -f docker-compose.yml --env-file .env.server up -d
```

The `bot` container applies `prisma migrate deploy` automatically before the bot starts.
The `reminders` container runs `npm run reminders:send` in a loop.

## Logs

```bash
docker compose -f docker-compose.yml logs -f bot
```

Reminder logs:

```bash
docker compose -f docker-compose.yml logs -f reminders
```

## Health

```bash
docker compose -f docker-compose.yml ps
```

The container has a built-in Docker healthcheck for SQLite access and required tables.

## Backup

Create a backup inside the running container:

```bash
docker compose -f docker-compose.yml --env-file .env.server exec bot npm run backup:sqlite
```

Backups are written to the mounted `./backups` directory on the server.

## Expiry reminders

Automatic reminder delivery runs in the separate `reminders` service.

By default it sleeps `86400` seconds between runs. Change that through `REMINDER_INTERVAL_SECONDS` in `.env.server`.

If you need an immediate run outside the loop:

```bash
docker compose -f docker-compose.yml --env-file .env.server exec reminders npm run reminders:send
```

The runner sends reminders only once for the same user, expiry date, and reminder window because it records delivery in `audit_logs`.

## Restore

1. Stop the bot:

```bash
docker compose -f docker-compose.yml --env-file .env.server stop bot
```

2. Restore the selected backup:

```bash
docker compose -f docker-compose.yml --env-file .env.server run --rm bot npm run restore:sqlite -- /app/backups/your-backup.db
```

3. Start the bot again:

```bash
docker compose -f docker-compose.yml --env-file .env.server up -d
```

The restore script creates a safety backup of the current SQLite file before overwriting it.

## Update

```bash
docker compose -f docker-compose.yml --env-file .env.server pull
docker compose -f docker-compose.yml --env-file .env.server up -d
```

## Notes

- do not run two bot instances with the same `BOT_TOKEN`
- keep the `prisma/` directory persistent
- SQLite is acceptable for MVP, but for bigger load a server DB is better
