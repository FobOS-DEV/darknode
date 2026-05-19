-- CreateTable
CREATE TABLE "Inbound" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "label" TEXT NOT NULL,
    "inboundTag" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "sni" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "shortId" TEXT NOT NULL,
    "flow" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL DEFAULT 'chrome',
    "network" TEXT NOT NULL DEFAULT 'tcp',
    "security" TEXT NOT NULL DEFAULT 'reality',
    "xrayApiAddress" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deprecatedAt" DATETIME
);

-- CreateIndex
CREATE UNIQUE INDEX "Inbound_inboundTag_key" ON "Inbound"("inboundTag");

-- CreateIndex
CREATE INDEX "Inbound_status_priority_idx" ON "Inbound"("status", "priority");

-- CreateTable
CREATE TABLE "Subscription" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "lastAccessedAt" DATETIME,
    CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_token_key" ON "Subscription"("token");

-- RedefineTables: add inboundId column with FK to VpnClient
PRAGMA defer_foreign_keys = ON;
PRAGMA foreign_keys = OFF;

CREATE TABLE "new_VpnClient" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "displayName" TEXT NOT NULL,
    "emailLabel" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "vlessUrl" TEXT NOT NULL,
    "server" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "publicKey" TEXT NOT NULL,
    "shortId" TEXT NOT NULL,
    "sni" TEXT NOT NULL,
    "flow" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    "inboundId" INTEGER,
    CONSTRAINT "VpnClient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VpnClient_inboundId_fkey" FOREIGN KEY ("inboundId") REFERENCES "Inbound" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_VpnClient" (
    "id", "userId", "displayName", "emailLabel", "uuid", "vlessUrl",
    "server", "port", "publicKey", "shortId", "sni", "flow",
    "status", "createdAt", "expiresAt", "updatedAt"
)
SELECT
    "id", "userId", "displayName", "emailLabel", "uuid", "vlessUrl",
    "server", "port", "publicKey", "shortId", "sni", "flow",
    "status", "createdAt", "expiresAt", "updatedAt"
FROM "VpnClient";

DROP TABLE "VpnClient";
ALTER TABLE "new_VpnClient" RENAME TO "VpnClient";

CREATE UNIQUE INDEX "VpnClient_userId_key" ON "VpnClient"("userId");
CREATE UNIQUE INDEX "VpnClient_uuid_key" ON "VpnClient"("uuid");
CREATE INDEX "VpnClient_inboundId_idx" ON "VpnClient"("inboundId");

PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = OFF;

-- CreateTable: InboundUser (M:N for per-inbound visibility)
CREATE TABLE "InboundUser" (
    "inboundId" INTEGER NOT NULL,
    "userId"    INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("inboundId", "userId"),
    CONSTRAINT "InboundUser_inboundId_fkey" FOREIGN KEY ("inboundId") REFERENCES "Inbound" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InboundUser_userId_fkey"    FOREIGN KEY ("userId")    REFERENCES "User"    ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "InboundUser_userId_idx" ON "InboundUser"("userId");
