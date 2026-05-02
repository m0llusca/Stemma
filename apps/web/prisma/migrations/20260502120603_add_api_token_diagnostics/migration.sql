-- AlterTable
ALTER TABLE "ApiToken" ADD COLUMN "lastError" TEXT;
ALTER TABLE "ApiToken" ADD COLUMN "lastErrorAt" DATETIME;
ALTER TABLE "ApiToken" ADD COLUMN "lastSuccessAt" DATETIME;
