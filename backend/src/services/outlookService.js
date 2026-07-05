import { getMicrosoftTokens } from '../utils/microsoftTokenStore.js';
import { encrypt, decrypt } from '../utils/encryption.js';
import { embedExtractedMessage } from './embeddingService.js';
import { prisma } from '../config/db.js';
import { GRAPH_API_BASE } from '../config/microsoft.js';

// ── Graph API helper ──────────────────────────────────────────────────────────

async function graphRequest(userId, path) {
  const tokens = await getMicrosoftTokens(userId);

  if (!tokens) {
    const error = new Error('No Microsoft tokens found for user');
    error.code = 'NO_MICROSOFT_TOKENS';
    throw error;
  }

  const res = await fetch(`${GRAPH_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      const error = new Error('Microsoft token invalid — user must reconnect Outlook');
      error.code = 'NO_MICROSOFT_TOKENS';
      throw error;
    }
    const err = await res.json().catch(() => ({}));
    throw new Error(`Graph API ${res.status}: ${err.error?.message || 'unknown error'}`);
  }

  return res.json();
}

// ── Text extraction & sanitization ───────────────────────────────────────────

function stripHtml(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractOutlookBodyText(message) {
  if (!message.body) return '';
  const { contentType, content } = message.body;
  if (contentType === 'text') return content || '';
  if (contentType === 'html') return stripHtml(content || '');
  return '';
}

function sanitizeBodyText(text) {
  if (!text) return '';

  let result = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const quoteMarkers = [
    /^On [\s\S]{0,300}?wrote:\s*$/m,
    /^-{2,}\s*Original Message\s*-{2,}/m,
    /^_{5,}\s*$/m,
    /(^>.*$\n?){2,}/m,
  ];
  for (const marker of quoteMarkers) {
    const match = result.match(marker);
    if (match && match.index !== undefined) result = result.slice(0, match.index);
  }

  const sigMatch = result.match(/^--\s*$/m);
  if (sigMatch && sigMatch.index !== undefined) result = result.slice(0, sigMatch.index);

  const disclaimerKeywords = /(confidential|intended recipient|privileged information|disclaimer)/i;
  result = result
    .split(/\n\s*\n/)
    .filter((p) => !disclaimerKeywords.test(p))
    .join('\n\n');

  return result.replace(/\n{3,}/g, '\n\n').trim();
}

// ── Message/thread normalization ─────────────────────────────────────────────

function formatOutlookAddress(emailAddress) {
  if (!emailAddress) return null;
  const { name, address } = emailAddress;
  return name ? `${name} <${address}>` : address;
}

function normalizeOutlookMessage(msg) {
  return {
    id: msg.id,
    conversationId: msg.conversationId,
    from: formatOutlookAddress(msg.from?.emailAddress),
    to: (msg.toRecipients || []).map((r) => r.emailAddress.address).join(', '),
    subject: msg.subject,
    date: msg.receivedDateTime,
    internalDate: new Date(msg.receivedDateTime).getTime().toString(),
    categories: msg.categories || [],
  };
}

function groupMessagesByConversation(messages) {
  const order = [];
  const byId = new Map();

  for (const message of messages) {
    let thread = byId.get(message.conversationId);

    if (!thread) {
      thread = {
        threadId: message.conversationId,
        subject: message.subject,
        from: message.from,
        to: message.to,
        date: message.date,
        internalDate: message.internalDate,
        categories: [],
        messageCount: 0,
        participants: [],
        messages: [],
        provider: 'outlook',
      };
      byId.set(message.conversationId, thread);
      order.push(message.conversationId);
    }

    thread.messageCount += 1;
    thread.messages.push(message);

    for (const cat of message.categories || []) {
      if (!thread.categories.includes(cat)) thread.categories.push(cat);
    }

    if (message.from && !thread.participants.includes(message.from)) {
      thread.participants.push(message.from);
    }

    if (Number(message.internalDate) > Number(thread.internalDate || 0)) {
      thread.subject = message.subject;
      thread.from = message.from;
      thread.date = message.date;
      thread.internalDate = message.internalDate;
    }
  }

  return order.map((id) => byId.get(id));
}

// ── Thread summary (metadata only, no body) ───────────────────────────────────

async function getFullOutlookThreadSummary(userId, conversationId) {
  const encoded = encodeURIComponent(`conversationId eq '${conversationId}'`);
  const data = await graphRequest(
    userId,
    `/me/messages?$filter=${encoded}&$select=id,conversationId,subject,from,toRecipients,receivedDateTime,categories&$top=100`
  );

  const messages = (data.value || [])
    .map(normalizeOutlookMessage)
    .sort((a, b) => Number(a.internalDate) - Number(b.internalDate));
  return groupMessagesByConversation(messages)[0];
}

// ── Public: list Outlook threads (preview, not saved) ────────────────────────

export async function getOutlookMetadata(userId, { q, maxResults, after, before } = {}) {
  const hasFilter = q || after || before;
  // $orderby cannot be combined with $search or $filter on /me/messages
  let url = `/me/messages?$select=id,conversationId,subject,from,toRecipients,receivedDateTime,categories&$top=${maxResults || 50}${hasFilter ? '' : '&$orderby=receivedDateTime desc'}`;

  if (q) {
    // $search and $filter cannot be combined in Graph Mail API
    url += `&$search=${encodeURIComponent(`"${q}"`)}`;
  } else {
    const filters = [];
    if (after) filters.push(`receivedDateTime ge ${new Date(after).toISOString()}`);
    if (before) filters.push(`receivedDateTime le ${new Date(before).toISOString()}`);
    if (filters.length > 0) url += `&$filter=${encodeURIComponent(filters.join(' and '))}`;
  }

  const data = await graphRequest(userId, url);
  const messages = (data.value || []).map(normalizeOutlookMessage);
  const threads = groupMessagesByConversation(messages);

  return { threads, nextLink: data['@odata.nextLink'] || null };
}

// ── DB upsert ─────────────────────────────────────────────────────────────────

function upsertOutlookThreadRow(userId, thread) {
  return prisma.thread.upsert({
    where: { userId_threadId: { userId, threadId: thread.threadId } },
    create: {
      userId,
      threadId: thread.threadId,
      subject: thread.subject,
      fromAddress: thread.from,
      toAddress: thread.to,
      labelIds: thread.categories || [],
      messageCount: thread.messageCount,
      internalDate: thread.internalDate ? BigInt(thread.internalDate) : null,
      data: thread,
      provider: 'outlook',
    },
    update: {
      subject: thread.subject,
      fromAddress: thread.from,
      toAddress: thread.to,
      labelIds: thread.categories || [],
      messageCount: thread.messageCount,
      internalDate: thread.internalDate ? BigInt(thread.internalDate) : null,
      data: thread,
      lastSyncedAt: new Date(),
      provider: 'outlook',
    },
  });
}

// ── Public: sync Outlook threads to DB ───────────────────────────────────────

export async function syncOutlookThreads(userId, { q, maxResults, after, before } = {}) {
  const { threads: matched } = await getOutlookMetadata(userId, {
    q,
    maxResults: maxResults || 50,
    after,
    before,
  });

  const threads = await Promise.all(
    matched.map((t) => getFullOutlookThreadSummary(userId, t.threadId))
  );

  await Promise.all(threads.map((t) => upsertOutlookThreadRow(userId, t)));

  return { syncedCount: threads.length };
}

export async function syncSelectedOutlookThreads(userId, conversationIds) {
  const threads = await Promise.all(
    conversationIds.map((id) => getFullOutlookThreadSummary(userId, id))
  );

  await Promise.all(threads.map((t) => upsertOutlookThreadRow(userId, t)));

  return { syncedCount: threads.length };
}

// ── Public: extract full message bodies for a thread ─────────────────────────

async function getOutlookThreadDetail(userId, conversationId) {
  const encoded = encodeURIComponent(`conversationId eq '${conversationId}'`);
  const data = await graphRequest(
    userId,
    `/me/messages?$filter=${encoded}&$select=id,conversationId,subject,from,toRecipients,receivedDateTime,body&$top=100`
  );

  const messages = (data.value || [])
    .sort((a, b) => new Date(a.receivedDateTime) - new Date(b.receivedDateTime))
    .map((msg) => ({
    id: msg.id,
    from: formatOutlookAddress(msg.from?.emailAddress),
    to: (msg.toRecipients || []).map((r) => r.emailAddress.address).join(', '),
    subject: msg.subject,
    date: msg.receivedDateTime,
    internalDate: new Date(msg.receivedDateTime).getTime().toString(),
    bodyText: extractOutlookBodyText(msg),
  }));

  return { threadId: conversationId, messages };
}

export async function extractOutlookThreadMessages(userId, threadId) {
  const { messages } = await getOutlookThreadDetail(userId, threadId);

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

  const embeddingResults = await Promise.allSettled(
    messages.map((message) =>
      embedExtractedMessage(userId, threadId, message.id, sanitizeBodyText(message.bodyText))
    )
  );
  embeddingResults
    .filter((r) => r.status === 'rejected')
    .forEach((r) => console.error('Outlook embedding generation failed:', r.reason));

  return { extractedCount: messages.length };
}

// ── Public: refresh already-authorized Outlook threads ───────────────────────

export async function refreshAuthorizedOutlookThreads(userId) {
  const approvedRows = await prisma.thread.findMany({
    where: { userId, consentAccepted: true, provider: 'outlook' },
  });

  if (approvedRows.length === 0) {
    return { checkedCount: 0, updatedCount: 0, reExtractedCount: 0 };
  }

  const liveSummaries = await Promise.all(
    approvedRows.map((row) => getFullOutlookThreadSummary(userId, row.threadId))
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

  await Promise.all(staleThreads.map((thread) => upsertOutlookThreadRow(userId, thread)));

  const results = await Promise.allSettled(
    staleThreads.map((thread) => extractOutlookThreadMessages(userId, thread.threadId))
  );
  const reExtractedCount = results.filter((r) => r.status === 'fulfilled').length;
  results
    .filter((r) => r.status === 'rejected')
    .forEach((r) => console.error('Outlook thread re-extraction failed:', r.reason));

  return {
    checkedCount: approvedRows.length,
    updatedCount: staleThreads.length,
    reExtractedCount,
  };
}
