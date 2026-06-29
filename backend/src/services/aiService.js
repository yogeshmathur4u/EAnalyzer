import { GoogleGenAI } from '@google/genai';
import { prisma } from '../config/db.js';
import { generateEmbedding, searchSimilarChunks } from './embeddingService.js';
import { getExtractedMessages } from './gmailService.js';

const GENERATION_MODEL = 'gemini-2.5-flash';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_INSTRUCTION = `You are a legal communication analysis assistant. You must answer ONLY using the numbered context blocks provided below — never use outside knowledge or assumptions.

Rules:
- If the context blocks do not contain enough information to answer, respond with exactly: "Data Not Found."
- When you make a claim, cite the context block(s) it came from using its number in square brackets, e.g. [1], [2].
- Do not speculate, infer beyond what's stated, or fill gaps with general knowledge.
- Be concise and factual.`;

const STORY_SYSTEM_INSTRUCTION = `You are a legal communication analysis assistant. You write a clear, chronological narrative of a conversation, using ONLY the numbered messages provided below — never use outside knowledge or assumptions.

Rules:
- Tell the story of what happened in order: who said what, when, and how the conversation progressed.
- When you state a fact or event, cite the message(s) it came from using its number in square brackets, e.g. [1], [2].
- Do not invent details, motivations, or outcomes that aren't explicitly in the messages.
- If the conversation seems incomplete or cuts off, say so rather than guessing what happens next.
- Write in plain prose, not a bulleted list.`;

export async function answerQuestion(userId, question, { threadId } = {}) {
  const queryEmbedding = await generateEmbedding(question);
  const chunks = await searchSimilarChunks(userId, queryEmbedding, { threadId, limit: 8 });

  if (chunks.length === 0) {
    return { answer: 'Data Not Found.', sources: [] };
  }

  const messageIds = [...new Set(chunks.map((c) => c.messageId))];
  const extractedMessages = await prisma.extractedMessage.findMany({
    where: { userId, messageId: { in: messageIds } },
  });
  const metadataByMessageId = new Map(extractedMessages.map((m) => [m.messageId, m]));

  const sources = chunks.map((chunk, i) => {
    const meta = metadataByMessageId.get(chunk.messageId);
    return {
      index: i + 1,
      messageId: chunk.messageId,
      threadId: meta?.threadId || null,
      from: meta?.fromAddress || null,
      subject: meta?.subject || null,
      date: meta?.date || null,
      chunkText: chunk.chunkText,
    };
  });

  const contextBlocks = sources
    .map(
      (s) =>
        `[${s.index}] From: ${s.from || 'Unknown'} | Date: ${s.date || 'Unknown'} | Subject: ${s.subject || 'Unknown'}\n${s.chunkText}`
    )
    .join('\n\n');

  const prompt = `${SYSTEM_INSTRUCTION}\n\nContext:\n${contextBlocks}\n\nQuestion: ${question}`;

  const result = await ai.models.generateContent({
    model: GENERATION_MODEL,
    contents: prompt,
  });

  return {
    answer: result.text,
    sources: sources.map(({ chunkText, ...rest }) => rest),
  };
}

export async function generateThreadStory(userId, threadId) {
  const { messages } = await getExtractedMessages(userId, threadId);

  if (messages.length === 0) {
    return { story: 'Data Not Found.', sources: [] };
  }

  const sources = messages.map((message, i) => ({
    index: i + 1,
    messageId: message.id,
    from: message.from,
    subject: message.subject,
    date: message.date,
  }));

  const contextBlocks = messages
    .map(
      (message, i) =>
        `[${i + 1}] From: ${message.from || 'Unknown'} | Date: ${message.date || 'Unknown'} | Subject: ${message.subject || 'Unknown'}\n${message.sanitizedText}`
    )
    .join('\n\n');

  const prompt = `${STORY_SYSTEM_INSTRUCTION}\n\nMessages:\n${contextBlocks}\n\nWrite the story of this conversation.`;

  const result = await ai.models.generateContent({
    model: GENERATION_MODEL,
    contents: prompt,
  });

  return { story: result.text, sources };
}
