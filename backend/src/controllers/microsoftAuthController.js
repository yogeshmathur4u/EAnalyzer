import crypto from 'crypto';
import { getMicrosoftAuthUrl, exchangeCodeForTokens } from '../config/microsoft.js';
import {
  saveMicrosoftTokens,
  deleteMicrosoftTokens,
  hasMicrosoftTokens,
} from '../utils/microsoftTokenStore.js';

const STATE_COOKIE = 'ms_oauth_state';
const isProd = process.env.NODE_ENV === 'production';

export function microsoftConnect(req, res) {
  const state = crypto.randomBytes(16).toString('hex');

  res.cookie(STATE_COOKIE, state, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 5 * 60 * 1000,
  });

  res.redirect(getMicrosoftAuthUrl(state));
}

export async function microsoftCallback(req, res) {
  const { code, state, error } = req.query;
  const expectedState = req.cookies[STATE_COOKIE];

  if (error) {
    console.error('Microsoft OAuth error:', error, req.query.error_description);
    return res.redirect(
      `${process.env.FRONTEND_URL}/dashboard?ms_error=${encodeURIComponent(error)}`
    );
  }

  if (!state || !expectedState || state !== expectedState) {
    return res.status(403).json({ error: 'Invalid or missing OAuth state' });
  }

  res.clearCookie(STATE_COOKIE, { httpOnly: true, secure: isProd, sameSite: isProd ? 'none' : 'lax' });

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
