-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TrafficSnapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "vpnClientId" INTEGER NOT NULL,
    "uplinkBytes" BIGINT NOT NULL,
    "downlinkBytes" BIGINT NOT NULL,
    "totalBytes" BIGINT NOT NULL,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrafficSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TrafficSnapshot_vpnClientId_fkey" FOREIGN KEY ("vpnClientId") REFERENCES "VpnClient" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TrafficSnapshot" ("id", "userId", "vpnClientId", "uplinkBytes", "downlinkBytes", "totalBytes", "capturedAt")
    SELECT "id", "userId", "vpnClientId", "uplinkBytes", "downlinkBytes", "totalBytes", "capturedAt" FROM "TrafficSnapshot";
DROP TABLE "TrafficSnapshot";
ALTER TABLE "new_TrafficSnapshot" RENAME TO "TrafficSnapshot";
CREATE INDEX "TrafficSnapshot_userId_capturedAt_idx" ON "TrafficSnapshot"("userId", "capturedAt");
CREATE INDEX "TrafficSnapshot_vpnClientId_capturedAt_idx" ON "TrafficSnapshot"("vpnClientId", "capturedAt");
CREATE INDEX "TrafficSnapshot_capturedAt_idx" ON "TrafficSnapshot"("capturedAt");
PRAGMA foreign_keys=ON;
