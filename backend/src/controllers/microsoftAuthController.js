import crypto from 'crypto';
import { getMicrosoftAuthUrl, exchangeCodeForTokens } from '../config/microsoft.js';
import {
  saveMicrosoftTokens,
  deleteMicrosoftTokens,
  hasMicrosoftTokens,
} from '../utils/microsoftTokenStore.js';

// State = HMAC(userId, secret) — no cookie needed, survives cross-domain redirects.
function generateState(userId) {
  return crypto
    .createHmac('sha256', process.env.SESSION_SECRET || 'ms-state-secret')
    .update(userId)
    .digest('hex');
}

export function microsoftConnect(req, res) {
  const state = generateState(req.user.id);
  res.redirect(getMicrosoftAuthUrl(state));
}

export async function microsoftCallback(req, res) {
  const { code, state, error } = req.query;

  if (error) {
    console.error('Microsoft OAuth error:', error, req.query.error_description);
    return res.redirect(
      `${process.env.FRONTEND_URL}/dashboard?ms_error=${encodeURIComponent(error)}`
    );
  }

  const expectedState = generateState(req.user.id);
  if (!state || state !== expectedState) {
    return res.status(403).json({ error: 'Invalid or missing OAuth state' });
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    await saveMicrosoftTokens(req.user.id, tokens);
    res.redirect(`${process.env.FRONTEND_URL}/dashboard?ms_connected=1`);
  } catch (err) {
    console.error('Microsoft OAuth callback failed:', err);
    res.redirect(`${process.env.FRONTEND_URL}/dashboard?ms_error=oauth_failed`);
  }
}

export async function microsoftStatus(req, res) {
  const connected = await hasMicrosoftTokens(req.user.id);
  res.status(200).json({ connected });
}

export async function microsoftDisconnect(req, res) {
  await deleteMicrosoftTokens(req.user.id);
  res.status(204).end();
}
