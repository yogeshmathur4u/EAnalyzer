export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })

  if (!res.ok) {
    const error = new Error(`Request failed: ${res.status}`)
    error.status = res.status
    try {
      error.body = await res.json()
    } catch {
      // no JSON body
    }
    throw error
  }

  if (res.status === 204) return null
  return res.json()
}

export const api = {
  me: () => request('/auth/me'),
  logout: () => request('/auth/logout'),
  getGmailMetadata: ({ q, maxResults, pageToken } = {}) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (maxResults) params.set('maxResults', maxResults)
    if (pageToken) params.set('pageToken', pageToken)
    return request(`/gmail/metadata?${params.toString()}`)
  },
  getSavedThreads: ({ emailFilter, subjectFilter, page } = {}) => {
    const params = new URLSearchParams()
    if (emailFilter) params.set('emailFilter', emailFilter)
    if (subjectFilter) params.set('subjectFilter', subjectFilter)
    if (page) params.set('page', page)
    return request(`/gmail/threads?${params.toString()}`)
  },
  syncFromGmail: ({ q, maxResults } = {}) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (maxResults) params.set('maxResults', maxResults)
    return request(`/gmail/sync?${params.toString()}`, { method: 'POST' })
  },
  syncSelectedThreads: (threadIds) =>
    request('/gmail/sync/selected', {
      method: 'POST',
      body: JSON.stringify({ threadIds }),
    }),
  refreshAuthorizedThreads: () =>
    request('/gmail/threads/refresh-authorized', { method: 'POST' }),
  submitConsent: (threadIds) =>
    request('/gmail/threads/consent', {
      method: 'POST',
      body: JSON.stringify({ threadIds }),
    }),
  getExtractedMessages: (threadId) => request(`/gmail/threads/${threadId}/extracted`),
  askQuestion: ({ question, threadId } = {}) =>
    request('/ai/ask', {
      method: 'POST',
      body: JSON.stringify({ question, threadId }),
    }),
  generateThreadStory: (threadId) =>
    request(`/ai/threads/${threadId}/story`, { method: 'POST' }),
}
