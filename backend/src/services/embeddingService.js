import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import { prisma } from '../config/db.js';
import { encrypt, decrypt } from '../utils/encryption.js';

const EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_DIMENSIONS = 768;

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Splits text into paragraph-based chunks under maxChunkChars. Paragraphs
// that individually exceed the limit are further split by sentence so no
// single chunk blows past the size budget.
export function chunkText(text, maxChunkChars = 800) {
  if (!text || !text.trim()) return [];

  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let current = '';

  function flush() {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  }

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;

    if (candidate.length <= maxChunkChars) {
      current = candidate;
      continue;
    }

    flush();

    if (paragraph.length <= maxChunkChars) {
      current = paragraph;
      continue;
    }

    // Paragraph itself is too long — split by sentence and pack those.
    const sentences = paragraph.split(/(?<=[.!?])\s+/);
    for (const sentence of sentences) {
      const sentenceCandidate = current ? `${current} ${sentence}` : sentence;
      if (sentenceCandidate.length <= maxChunkChars) {
        current = sentenceCandidate;
      } else {
        flush();
        current = sentence;
      }
    }
  }

  flush();
  return chunks;
}

export async function generateEmbedding(text) {
  const result = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text,
    config: { outputDimensionality: EMBEDDING_DIMENSIONS },
  });

  return result.embeddings[0].values;
}

export async function embedExtractedMessage(userId, threadId, messageId, plaintext) {
  await prisma.messageChunk.deleteMany({ where: { messageId } });

  const chunks = chunkText(plaintext);
  if (chunks.length === 0) return { chunkCount: 0 };

  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index];
    const embedding = await generateEmbedding(chunk);
    const vectorLiteral = `[${embedding.join(',')}]`;
    const encryptedChunkText = encrypt(chunk);
    const id = crypto.randomUUID();

    await prisma.$executeRaw`
      INSERT INTO "MessageChunk" (id, "userId", "threadId", "messageId", "chunkIndex", "chunkText", embedding, "createdAt")
      VALUES (${id}, ${userId}, ${threadId}, ${messageId}, ${index}, ${encryptedChunkText}, ${vectorLiteral}::vector, now())
    `;
  }

  return { chunkCount: chunks.length };
}

export async function searchSimilarChunks(userId, queryEmbedding, { threadId, limit = 8 } = {}) {
  const vectorLiteral = `[${queryEmbedding.join(',')}]`;

  const rows = threadId
    ? await prisma.$queryRaw`
        SELECT id, "messageId", "chunkIndex", "chunkText", embedding <=> ${vectorLiteral}::vector AS distance
        FROM "MessageChunk"
        WHERE "userId" = ${userId} AND "threadId" = ${threadId}
        ORDER BY distance ASC
        LIMIT ${limit}
      `
    : await prisma.$queryRaw`
        SELECT id, "messageId", "chunkIndex", "chunkText", embedding <=> ${vectorLiteral}::vector AS distance
        FROM "MessageChunk"
        WHERE "userId" = ${userId}
        ORDER BY distance ASC
        LIMIT ${limit}
      `;

  return rows.map((row) => ({ ...row, chunkText: decrypt(row.chunkText) }));
}
