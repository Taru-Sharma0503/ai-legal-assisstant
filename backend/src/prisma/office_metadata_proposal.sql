-- Review proposal only. Do not execute directly; use a reviewed Prisma migration later.
-- Existing table naming follows @@map("offices") and @@map("office_services").
ALTER TABLE "offices"
  ALTER COLUMN "address" DROP NOT NULL,
  ALTER COLUMN "pincode" DROP NOT NULL,
  ALTER COLUMN "latitude" DROP NOT NULL,
  ALTER COLUMN "longitude" DROP NOT NULL,
  ADD COLUMN "sourceName" TEXT,
  ADD COLUMN "sourceUrl" TEXT,
  ADD COLUMN "verifiedAt" TIMESTAMP(3),
  ADD COLUMN "coordinateSource" TEXT,
  ADD COLUMN "coordinateSourceUrl" TEXT,
  ADD COLUMN "coordinateApproximate" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "seedKey" TEXT;

CREATE UNIQUE INDEX "offices_seedKey_key" ON "offices"("seedKey");

ALTER TABLE "office_services"
  ADD COLUMN "sourceName" TEXT,
  ADD COLUMN "sourceUrl" TEXT,
  ADD COLUMN "verifiedAt" TIMESTAMP(3);
