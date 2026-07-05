-- AlterTable
ALTER TABLE "Thread" ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'gmail';

-- CreateTable
CREATE TABLE "MicrosoftToken" (
    "userId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "scope" TEXT,
    "tokenType" TEXT,
    "expiryDate" BIGINT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MicrosoftToken_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "MicrosoftToken" ADD CONSTRAINT "MicrosoftToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
