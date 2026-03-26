# Server Deploy

## Files

Create these files on the server:

- `docker-compose.yml` from `deploy/docker-compose.ghcr.yml`
- `.env.server` from `deploy/.env.server.example`
- directory `prisma/` for the SQLite database

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

## Logs

```bash
docker compose -f docker-compose.yml logs -f bot
```

## Update

```bash
docker compose -f docker-compose.yml --env-file .env.server pull
docker compose -f docker-compose.yml --env-file .env.server up -d
```

## Notes

- do not run two bot instances with the same `BOT_TOKEN`
- keep the `prisma/` directory persistent
- SQLite is acceptable for MVP, but for bigger load a server DB is better
