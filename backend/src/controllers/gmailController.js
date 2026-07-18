import {
  getMessageMetadata,
  getThreadDetail,
  getSavedThreads,
  syncThreads,
  syncSelectedThreads,
  refreshAuthorizedThreads,
  recordConsent,
  getExtractedMessages,
} from '../services/gmailService.js';

export async function getMetadata(req, res) {
  const { q, maxResults, pageToken } = req.query;
  const parsedMax = maxResults ? Number(maxResults) : undefined;
  if (parsedMax !== undefined && (!Number.isInteger(parsedMax) || parsedMax < 1)) {
    return res.status(400).json({ error: 'maxResults must be a positive integer' });
  }

  try {
    const result = await getMessageMetadata(req.user.id, {
      q,
      maxResults: parsedMax ? Math.min(parsedMax, 200) : undefined,
      pageToken,
    });

    res.status(200).json(result);
  } catch (err) {
    if (err.code === 'NO_GOOGLE_TOKENS') {
      return res
        .status(401)
        .json({ error: 'Gmail not connected, please re-authenticate' });
    }

    console.error('Gmail metadata fetch failed:', err);
    res.status(500).json({ error: 'Failed to fetch Gmail metadata' });
  }
}

export async function getThread(req, res) {
  try {
    const result = await getThreadDetail(req.user.id, req.params.threadId);
    res.status(200).json(result);
  } catch (err) {
    if (err.code === 'NO_GOOGLE_TOKENS') {
      return res
        .status(401)
        .json({ error: 'Gmail not connected, please re-authenticate' });
    }

    console.error('Gmail thread fetch failed:', err);
    res.status(500).json({ error: 'Failed to fetch thread' });
  }
}

export async function getThreads(req, res) {
  const { emailFilter, subjectFilter, page } = req.query;
  const take = 25;
  const pageNum = page ? Number(page) : 1;

  try {
    const result = await getSavedThreads(req.user.id, {
      emailFilter,
      subjectFilter,
      skip: (pageNum - 1) * take,
      take,
    });

    res.status(200).json(result);
  } catch (err) {
    console.error('Saved threads fetch failed:', err);
    res.status(500).json({ error: 'Failed to fetch saved threads' });
  }
}

export async function syncFromGmail(req, res) {
  const { q, maxResults } = req.query;
  const parsedMax = maxResults ? Number(maxResults) : undefined;

  try {
    const result = await syncThreads(req.user.id, {
      q,
      maxResults: parsedMax ? Math.min(parsedMax, 200) : undefined,
    });

    res.status(200).json(result);
  } catch (err) {
    if (err.code === 'NO_GOOGLE_TOKENS') {
      return res
        .status(401)
        .json({ error: 'Gmail not connected, please re-authenticate' });
    }

    console.error('Gmail sync failed:', err);
    res.status(500).json({ error: 'Failed to sync from Gmail' });
  }
}

export async function syncSelected(req, res) {
  const { threadIds } = req.body;

  if (!Array.isArray(threadIds) || threadIds.length === 0) {
    return res.status(400).json({ error: 'threadIds must be a non-empty array' });
  }
  if (threadIds.length > 50) {
    return res.status(400).json({ error: 'Cannot sync more than 50 threads at once' });
  }

  try {
    const result = await syncSelectedThreads(req.user.id, threadIds);
    res.status(200).json(result);
  } catch (err) {
    if (err.code === 'NO_GOOGLE_TOKENS') {
      return res
        .status(401)
        .json({ error: 'Gmail not connected, please re-authenticate' });
    }

    console.error('Syncing selected threads failed:', err);
    res.status(500).json({ error: 'Failed to sync selected threads' });
  }
}

export async function refreshAuthorized(req, res) {
  try {
    const result = await refreshAuthorizedThreads(req.user.id);
    res.status(200).json(result);
  } catch (err) {
    if (err.code === 'NO_GOOGLE_TOKENS') {
      return res
        .status(401)
        .json({ error: 'Gmail not connected, please re-authenticate' });
    }

    console.error('Refreshing authorized threads failed:', err);
    res.status(500).json({ error: 'Failed to refresh authorized threads' });
  }
}

export async function submitConsent(req, res) {
  const { threadIds } = req.body;

  if (!Array.isArray(threadIds) || threadIds.length === 0) {
    return res.status(400).json({ error: 'threadIds must be a non-empty array' });
  }
  if (threadIds.length > 50) {
    return res.status(400).json({ error: 'Cannot authorize more than 50 threads at once' });
  }

  try {
    const result = await recordConsent(req.user.id, threadIds);
    res.status(200).json(result);
  } catch (err) {
    console.error('Recording consent failed:', err);
    res.status(500).json({ error: 'Failed to record consent' });
  }
}

export async function getExtracted(req, res) {
  try {
    const result = await getExtractedMessages(req.user.id, req.params.threadId);
    res.status(200).json(result);
  } catch (err) {
    console.error('Extracted messages fetch failed:', err);
    res.status(500).json({ error: 'Failed to fetch extracted messages' });
  }
}
