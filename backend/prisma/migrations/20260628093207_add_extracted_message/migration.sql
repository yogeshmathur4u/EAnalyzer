-- CreateTable
CREATE TABLE "ExtractedMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "fromAddress" TEXT,
    "toAddress" TEXT,
    "subject" TEXT,
    "date" TEXT,
    "sanitizedText" TEXT NOT NULL,
    "originalLength" INTEGER NOT NULL,
    "sanitizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtractedMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExtractedMessage_messageId_key" ON "ExtractedMessage"("messageId");

-- CreateIndex
CREATE INDEX "ExtractedMessage_userId_threadId_idx" ON "ExtractedMessage"("userId", "threadId");

-- AddForeignKey
ALTER TABLE "ExtractedMessage" ADD CONSTRAINT "ExtractedMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
