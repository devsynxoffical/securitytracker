-- CreateTable
CREATE TABLE "ActivityBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sampleCount" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "ActivityBatch_batchId_key" ON "ActivityBatch"("batchId");

-- CreateIndex
CREATE INDEX "ActivityBatch_batchId_idx" ON "ActivityBatch"("batchId");

-- CreateIndex
CREATE INDEX "ActivityBatch_deviceId_idx" ON "ActivityBatch"("deviceId");

-- CreateIndex
CREATE INDEX "ActivityBatch_userId_idx" ON "ActivityBatch"("userId");
