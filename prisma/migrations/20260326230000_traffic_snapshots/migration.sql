-- CreateTable
CREATE TABLE "TrafficSnapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "vpnClientId" INTEGER NOT NULL,
    "uplinkBytes" INTEGER NOT NULL,
    "downlinkBytes" INTEGER NOT NULL,
    "totalBytes" INTEGER NOT NULL,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrafficSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TrafficSnapshot_vpnClientId_fkey" FOREIGN KEY ("vpnClientId") REFERENCES "VpnClient" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TrafficSnapshot_userId_capturedAt_idx" ON "TrafficSnapshot"("userId", "capturedAt");

-- CreateIndex
CREATE INDEX "TrafficSnapshot_vpnClientId_capturedAt_idx" ON "TrafficSnapshot"("vpnClientId", "capturedAt");

-- CreateIndex
CREATE INDEX "TrafficSnapshot_capturedAt_idx" ON "TrafficSnapshot"("capturedAt");
