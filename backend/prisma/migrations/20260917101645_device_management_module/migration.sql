-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Device" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "osType" TEXT NOT NULL,
    "osVersion" TEXT,
    "agentVersion" TEXT,
    "deviceTokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" DATETIME,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Device" ("agentVersion", "createdAt", "deviceTokenHash", "hostname", "id", "isRevoked", "lastSeenAt", "osType", "osVersion", "updatedAt", "userId") SELECT "agentVersion", "createdAt", "deviceTokenHash", "hostname", "id", "isRevoked", "lastSeenAt", "osType", "osVersion", "updatedAt", "userId" FROM "Device";
DROP TABLE "Device";
ALTER TABLE "new_Device" RENAME TO "Device";
CREATE UNIQUE INDEX "Device_deviceTokenHash_key" ON "Device"("deviceTokenHash");
CREATE INDEX "Device_userId_idx" ON "Device"("userId");
CREATE INDEX "Device_status_idx" ON "Device"("status");
CREATE INDEX "Device_isRevoked_idx" ON "Device"("isRevoked");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
