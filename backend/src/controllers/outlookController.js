import {
  getOutlookMetadata,
  syncOutlookThreads,
  syncSelectedOutlookThreads,
  refreshAuthorizedOutlookThreads,
  extractOutlookThreadMessages,
} from '../services/outlookService.js';
import { prisma } from '../config/db.js';

export async function getMetadata(req, res) {
  const { q, maxResults, after, before } = req.query;

  try {
    const result = await getOutlookMetadata(req.user.id, {
      q,
      maxResults: maxResults ? Number(maxResults) : undefined,
      after,
      before,
    });
    res.status(200).json(result);
  } catch (err) {
    if (err.code === 'NO_MICROSOFT_TOKENS') {
      return res.status(401).json({ error: 'Outlook not connected' });
    }
    console.error('Outlook metadata fetch failed:', err);
    res.status(500).json({ error: 'Failed to fetch Outlook metadata' });
  }
}

export async function syncFromOutlook(req, res) {
  const { q, maxResults, after, before } = req.query;

  try {
    const result = await syncOutlookThreads(req.user.id, {
      q,
      maxResults: maxResults ? Number(maxResults) : undefined,
      after,
      before,
    });
    res.status(200).json(result);
  } catch (err) {
    if (err.code === 'NO_MICROSOFT_TOKENS') {
      return res.status(401).json({ error: 'Outlook not connected' });
    }
    console.error('Outlook sync failed:', err);
    res.status(500).json({ error: 'Failed to sync from Outlook' });
  }
}

export async function syncSelected(req, res) {
  const { conversationIds } = req.body;

  if (!Array.isArray(conversationIds) || conversationIds.length === 0) {
    return res.status(400).json({ error: 'conversationIds must be a non-empty array' });
  }

  try {
    const result = await syncSelectedOutlookThreads(req.user.id, conversationIds);
    res.status(200).json(result);
  } catch (err) {
    if (err.code === 'NO_MICROSOFT_TOKENS') {
      return res.status(401).json({ error: 'Outlook not connected' });
    }
    console.error('Syncing selected Outlook threads failed:', err);
    res.status(500).json({ error: 'Failed to sync selected Outlook threads' });
  }
}

export async function refreshAuthorized(req, res) {
  try {
    const result = await refreshAuthorizedOutlookThreads(req.user.id);
    res.status(200).json(result);
  } catch (err) {
    if (err.code === 'NO_MICROSOFT_TOKENS') {
      return res.status(401).json({ error: 'Outlook not connected' });
    }
    console.error('Refreshing authorized Outlook threads failed:', err);
    res.status(500).json({ error: 'Failed to refresh authorized Outlook threads' });
  }
}

export async function submitConsent(req, res) {
  const { threadIds } = req.body;

  if (!Array.isArray(threadIds) || threadIds.length === 0) {
    return res.status(400).json({ error: 'threadIds must be a non-empty array' });
  }

  try {
    const updated = await prisma.thread.updateMany({
      where: { userId: req.user.id, threadId: { in: threadIds } },
      data: { consentAccepted: true, consentAcceptedAt: new Date() },
    });

    const extractionResults = await Promise.allSettled(
      threadIds.map((threadId) => extractOutlookThreadMessages(req.user.id, threadId))
    );

    const extractedMessageCount = extractionResults
      .filter((r) => r.status === 'fulfilled')
      .reduce((sum, r) => sum + r.value.extractedCount, 0);
    const failedThreadCount = extractionResults.filter((r) => r.status === 'rejected').length;

    res.status(200).json({
      updatedCount: updated.count,
      extractedMessageCount,
      failedThreadCount,
    });
  } catch (err) {
    console.error('Recording Outlook consent failed:', err);
    res.status(500).json({ error: 'Failed to record consent' });
  }
}
