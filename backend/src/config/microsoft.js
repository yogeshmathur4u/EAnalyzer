const MICROSOFT_AUTH_BASE = 'https://login.microsoftonline.com/common/oauth2/v2.0';
export const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';

export const MICROSOFT_SCOPES = [
  'openid',
  'email',
  'profile',
  'Mail.Read',
  'offline_access',
].join(' ');

export function getMicrosoftAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID,
    response_type: 'code',
    redirect_uri: process.env.MICROSOFT_REDIRECT_URI,
    response_mode: 'query',
    scope: MICROSOFT_SCOPES,
    state,
  });
  return `${MICROSOFT_AUTH_BASE}/authorize?${params.toString()}`;
}

export async function exchangeCodeForTokens(code) {
  const body = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET,
    code,
    redirect_uri: process.env.MICROSOFT_REDIRECT_URI,
    grant_type: 'authorization_code',
    scope: MICROSOFT_SCOPES,
  });

  const res = await fetch(`${MICROSOFT_AUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Microsoft token exchange failed: ${err.error_description || err.error}`);
  }

  return res.json();
}

export async function refreshMicrosoftTokens(refreshToken) {
  const body = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    scope: MICROSOFT_SCOPES,
  });

  const res = await fetch(`${MICROSOFT_AUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Microsoft token refresh failed: ${err.error_description || err.error}`);
  }

  return res.json();
}
