-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateTable
CREATE TABLE "MessageChunk" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "chunkText" TEXT NOT NULL,
    "embedding" vector(768),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessageChunk_userId_threadId_idx" ON "MessageChunk"("userId", "threadId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageChunk_messageId_chunkIndex_key" ON "MessageChunk"("messageId", "chunkIndex");

-- AddForeignKey
ALTER TABLE "MessageChunk" ADD CONSTRAINT "MessageChunk_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
