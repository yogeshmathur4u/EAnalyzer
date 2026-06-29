-- AlterTable
ALTER TABLE "Thread" ADD COLUMN     "toAddress" TEXT;

-- AddForeignKey
ALTER TABLE "ExtractedMessage" ADD CONSTRAINT "ExtractedMessage_userId_threadId_fkey" FOREIGN KEY ("userId", "threadId") REFERENCES "Thread"("userId", "threadId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageChunk" ADD CONSTRAINT "MessageChunk_userId_threadId_fkey" FOREIGN KEY ("userId", "threadId") REFERENCES "Thread"("userId", "threadId") ON DELETE CASCADE ON UPDATE CASCADE;
