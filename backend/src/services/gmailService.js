import { google } from 'googleapis';
import { createOAuth2Client } from '../config/google.js';
import { getTokens, saveTokens } from '../utils/tokenStore.js';
import { encrypt, decrypt } from '../utils/encryption.js';
import { embedExtractedMessage } from './embeddingService.js';
import { prisma } from '../config/db.js';

const METADATA_HEADERS = ['From', 'To', 'Subject', 'Date'];

function headerValue(headers, name) {
  const header = headers.find((h) => h.name === name);
  return header ? header.value : null;
}

function stripHtml(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractBodyText(payload) {
  if (!payload) return '';

  if (payload.body?.data && payload.mimeType === 'text/plain') {
    return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64url').toString('utf-8');
      }
    }
    for (const part of payload.parts) {
      if (part.mimeType?.startsWith('multipart/')) {
        const nested = extractBodyText(part);
        if (nested) return nested;
      }
    }
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        return stripHtml(Buffer.from(part.body.data, 'base64url').toString('utf-8'));
      }
    }
  }

  if (payload.body?.data && payload.mimeType === 'text/html') {
    return stripHtml(Buffer.from(payload.body.data, 'base64url').toString('utf-8'));
  }

  return '';
}

// Best-effort heuristic cleanup of email body text: strips quoted reply
// chains, signature blocks, and common confidentiality disclaimers. This is
// NOT guaranteed to be perfect for every email client's formatting quirks —
// it's a pragmatic pass, not a guarantee of fully clean text.
function sanitizeBodyText(text) {
  if (!text) return '';

  // Normalize line endings first — Gmail bodies often use CRLF, and a stray
  // \r breaks every ^...$ multiline regex below (the $ never lines up with
  // the \n because of the \r sitting in between).
  let result = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 1. Truncate at the first quoted-reply marker (everything after duplicates
  // a message already present elsewhere in this thread).
  const quoteMarkers = [
    // Gmail wraps long "On <date>, <name> wrote:" headers onto two lines, so
    // "wrote:" often isn't on the same line as "On " — allow it to span a
    // line break.
    /^On [\s\S]{0,300}?wrote:\s*$/m,
    /^-{2,}\s*Original Message\s*-{2,}/m,
    /^_{5,}\s*$/m,
    /(^>.*$\n?){2,}/m,
  ];
  for (const marker of quoteMarkers) {
    const match = result.match(marker);
    if (match && match.index !== undefined) {
      result = result.slice(0, match.index);
    }
  }

  // 2. Truncate at a standalone signature delimiter line.
  const signatureMarker = /^--\s*$/m;
  const sigMatch = result.match(signatureMarker);
  if (sigMatch && sigMatch.index !== undefined) {
    result = result.slice(0, sigMatch.index);
  }

  // 3. Strip paragraphs that look like confidentiality/legal disclaimers.
  const disclaimerKeywords = /(confidential|intended recipient|privileged information|disclaimer)/i;
  result = result
    .split(/\n\s*\n/)
    .filter((paragraph) => !disclaimerKeywords.test(paragraph))
    .join('\n\n');

  // 4. Collapse excess blank lines and trim.
  return result.replace(/\n{3,}/g, '\n\n').trim();
}

async function getGmailClient(userId) {
  const tokens = await getTokens(userId);

  if (!tokens) {
    const error = new Error('No Google tokens found for user');
    error.code = 'NO_GOOGLE_TOKENS';
    throw error;
  }

  const client = createOAuth2Client();
  client.setCredentials(tokens);
  client.on('tokens', (refreshed) => {
    saveTokens(userId, { ...tokens, ...refreshed });
  });

  return google.gmail({ version: 'v1', auth: client });
}

function groupMessagesByThread(messages) {
  const threadOrder = [];
  const threadsById = new Map();

  for (const message of messages) {
    let thread = threadsById.get(message.threadId);

    if (!thread) {
      thread = {
        threadId: message.threadId,
        subject: message.subject,
        from: message.from,
        date: message.date,
        labelIds: [],
        messageCount: 0,
        participants: [],
        messages: [],
      };
      threadsById.set(message.threadId, thread);
      threadOrder.push(message.threadId);
    }

    thread.messageCount += 1;
    thread.messages.push(message);

    for (const label of message.labelIds || []) {
      if (!thread.labelIds.includes(label)) thread.labelIds.push(label);
    }

    if (message.from && !thread.participants.includes(message.from)) {
      thread.participants.push(message.from);
    }

    // messages arrive newest-first from Gmail; keep the newest message's subject/from/date as representative
    if (Number(message.internalDate) > Number(thread.internalDate || 0)) {
      thread.subject = message.subject;
      thread.from = message.from;
      thread.date = message.date;
      thread.internalDate = message.internalDate;
    }
  }

  return threadOrder.map((threadId) => threadsById.get(threadId));
}

export async function getMessageMetadata(userId, { q, maxResults, pageToken } = {}) {
  const gmail = await getGmailClient(userId);

  const list = await gmail.users.messages.list({
    userId: 'me',
    q,
    maxResults: maxResults || 25,
    pageToken,
  });

  const messageIds = list.data.messages || [];

  const messages = await Promise.all(
    messageIds.map(async ({ id, threadId }) => {
      const { data } = await gmail.users.messages.get({
        userId: 'me',
        id,
        format: 'metadata',
        metadataHeaders: METADATA_HEADERS,
      });

      const headers = data.payload?.headers || [];

      return {
        id,
        threadId,
        from: headerValue(headers, 'From'),
        to: headerValue(headers, 'To'),
        subject: headerValue(headers, 'Subject'),
        date: headerValue(headers, 'Date'),
        labelIds: data.labelIds || [],
        internalDate: data.internalDate,
      };
    })
  );

  const threads = groupMessagesByThread(messages);

  return { threads, nextPageToken: list.data.nextPageToken || null };
}

async function getFullThreadSummary(gmail, threadId) {
  const { data } = await gmail.users.threads.get({
    userId: 'me',
    id: threadId,
    format: 'metadata',
    metadataHeaders: METADATA_HEADERS,
  });

  const messages = (data.messages || []).map((message) => {
    const headers = message.payload?.headers || [];

    return {
      id: message.id,
      threadId,
      from: headerValue(headers, 'From'),
      to: headerValue(headers, 'To'),
      subject: headerValue(headers, 'Subject'),
      date: headerValue(headers, 'Date'),
      labelIds: message.labelIds || [],
      internalDate: message.internalDate,
    };
  });

  return groupMessagesByThread(messages)[0];
}

export async function getThreadDetail(userId, threadId) {
  const gmail = await getGmailClient(userId);

  const { data } = await gmail.users.threads.get({
    userId: 'me',
    id: threadId,
    format: 'full',
  });

  const messages = (data.messages || [])
    .sort((a, b) => Number(a.internalDate) - Number(b.internalDate))
    .map((message) => {
      const headers = message.payload?.headers || [];

      return {
        id: message.id,
        from: headerValue(headers, 'From'),
        to: headerValue(headers, 'To'),
        subject: headerValue(headers, 'Subject'),
        date: headerValue(headers, 'Date'),
        internalDate: message.internalDate,
        bodyText: extractBodyText(message.payload),
      };
    });

  return { threadId, messages };
}

export async function getSavedThreads(
  userId,
  { emailFilter, subjectFilter, skip, take } = {}
) {
  const where = { userId };

  if (emailFilter) {
    where.fromAddress = { contains: emailFilter, mode: 'insensitive' };
  }

  if (subjectFilter) {
    where.subject = { contains: subjectFilter, mode: 'insensitive' };
  }

  const rows = await prisma.thread.findMany({
    where,
    orderBy: { internalDate: 'desc' },
    skip: skip || 0,
    take: take || 25,
  });

  const threads = rows.map((row) => ({
    ...row.data,
    lastSyncedAt: row.lastSyncedAt,
    consentAccepted: row.consentAccepted,
    consentAcceptedAt: row.consentAcceptedAt,
  }));

  const aggregate = await prisma.thread.aggregate({
    where,
    _count: true,
    _sum: { messageCount: true },
  });

  return {
    threads,
    total: aggregate._count,
    totalMessages: aggregate._sum.messageCount || 0,
  };
}

function upsertThreadRow(userId, thread) {
  return prisma.thread.upsert({
    where: { userId_threadId: { userId, threadId: thread.threadId } },
    create: {
      userId,
      threadId: thread.threadId,
      subject: thread.subject,
      fromAddress: thread.from,
      labelIds: thread.labelIds,
      messageCount: thread.messageCount,
      internalDate: thread.internalDate ? BigInt(thread.internalDate) : null,
      data: thread,
    },
    update: {
      subject: thread.subject,
      fromAddress: thread.from,
      labelIds: thread.labelIds,
      messageCount: thread.messageCount,
      internalDate: thread.internalDate ? BigInt(thread.internalDate) : null,
      data: thread,
      lastSyncedAt: new Date(),
    },
  });
}

export async function syncThreads(userId, { q, maxResults } = {}) {
  // messages.list only returns messages matching the active filter, which can
  // under-represent a thread (e.g. one of its messages falls outside the date
  // range). Use it only to discover *which* threads matched, then re-fetch
  // each thread's complete message list via threads.get for accurate counts.
  const { threads: matchedThreads } = await getMessageMetadata(userId, {
    q,
    maxResults: maxResults || 50,
  });

  const gmail = await getGmailClient(userId);
  const threads = await Promise.all(
    matchedThreads.map((thread) => getFullThreadSummary(gmail, thread.threadId))
  );

  await Promise.all(threads.map((thread) => upsertThreadRow(userId, thread)));

  return { syncedCount: threads.length };
}

export async function syncSelectedThreads(userId, threadIds) {
  const gmail = await getGmailClient(userId);
  const threads = await Promise.all(
    threadIds.map((threadId) => getFullThreadSummary(gmail, threadId))
  );

  await Promise.all(threads.map((thread) => upsertThreadRow(userId, thread)));

  return { syncedCount: threads.length };
}

export async function refreshAuthorizedThreads(userId) {
  const approvedRows = await prisma.thread.findMany({
    where: { userId, consentAccepted: true },
  });

  if (approvedRows.length === 0) {
    return { checkedCount: 0, updatedCount: 0, reExtractedCount: 0 };
  }

  const gmail = await getGmailClient(userId);
  const liveSummaries = await Promise.all(
    approvedRows.map((row) => getFullThreadSummary(gmail, row.threadId))
  );

  const extractedCounts = await prisma.extractedMessage.groupBy({
    by: ['threadId'],
    where: { userId, threadId: { in: approvedRows.map((row) => row.threadId) } },
    _count: { _all: true },
  });
  const extractedCountByThreadId = new Map(
    extractedCounts.map((row) => [row.threadId, row._count._all])
  );

  const staleThreads = liveSummaries.filter((thread) => {
    const extractedCount = extractedCountByThreadId.get(thread.threadId) ?? 0;
    return thread.messageCount !== extractedCount;
  });

  await Promise.all(staleThreads.map((thread) => upsertThreadRow(userId, thread)));

  const results = await Promise.allSettled(
    staleThreads.map((thread) => extractThreadMessages(userId, thread.threadId))
  );
  const reExtractedCount = results.filter((r) => r.status === 'fulfilled').length;
  results
    .filter((r) => r.status === 'rejected')
    .forEach((r) => console.error('Authorized thread re-extraction failed:', r.reason));

  return {
    checkedCount: approvedRows.length,
    updatedCount: staleThreads.length,
    reExtractedCount,
  };
}

export async function extractThreadMessages(userId, threadId) {
  const { messages } = await getThreadDetail(userId, threadId);

  await Promise.all(
    messages.map((message) => {
      const plainSanitizedText = sanitizeBodyText(message.bodyText);

      return prisma.extractedMessage.upsert({
        where: { messageId: message.id },
        create: {
          userId,
          threadId,
          messageId: message.id,
          fromAddress: message.from,
          toAddress: message.to,
          subject: message.subject,
          date: message.date,
          internalDate: message.internalDate ? BigInt(message.internalDate) : null,
          sanitizedText: encrypt(plainSanitizedText),
          originalLength: message.bodyText.length,
        },
        update: {
          fromAddress: message.from,
          toAddress: message.to,
          subject: message.subject,
          date: message.date,
          internalDate: message.internalDate ? BigInt(message.internalDate) : null,
          sanitizedText: encrypt(plainSanitizedText),
          originalLength: message.bodyText.length,
          sanitizedAt: new Date(),
        },
      });
    })
  );

  // Chunk + embed for the RAG foundation. Best-effort: an embedding hiccup
  // (e.g. a transient API error) shouldn't undo the extraction that already
  // succeeded above.
  const embeddingResults = await Promise.allSettled(
    messages.map((message) =>
      embedExtractedMessage(userId, threadId, message.id, sanitizeBodyText(message.bodyText))
    )
  );
  embeddingResults
    .filter((r) => r.status === 'rejected')
    .forEach((r) => console.error('Embedding generation failed:', r.reason));

  return { extractedCount: messages.length };
}

export async function getExtractedMessages(userId, threadId) {
  const rows = await prisma.extractedMessage.findMany({
    where: { userId, threadId },
    orderBy: { internalDate: 'asc' },
  });

  const messages = rows.map((row) => ({
    id: row.id,
    from: row.fromAddress,
    to: row.toAddress,
    subject: row.subject,
    date: row.date,
    sanitizedText: decrypt(row.sanitizedText),
    originalLength: row.originalLength,
  }));

  return { threadId, messages };
}

export async function recordConsent(userId, threadIds) {
  const result = await prisma.thread.updateMany({
    where: { userId, threadId: { in: threadIds } },
    data: { consentAccepted: true, consentAcceptedAt: new Date() },
  });

  const extractionResults = await Promise.allSettled(
    threadIds.map((threadId) => extractThreadMessages(userId, threadId))
  );

  const extractedMessageCount = extractionResults
    .filter((r) => r.status === 'fulfilled')
    .reduce((sum, r) => sum + r.value.extractedCount, 0);
  const failedThreadCount = extractionResults.filter((r) => r.status === 'rejected').length;

  if (failedThreadCount > 0) {
    extractionResults
      .filter((r) => r.status === 'rejected')
      .forEach((r) => console.error('Thread extraction failed:', r.reason));
  }

  return { updatedCount: result.count, extractedMessageCount, failedThreadCount };
}
