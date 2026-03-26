FROM node:24-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY proto ./proto
COPY scripts ./scripts
COPY src ./src
RUN npm run build

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 CMD ["npm", "run", "healthcheck"]

CMD ["npm", "run", "start:container"]
