import { getMicrosoftAuthUrl, exchangeCodeForTokens } from '../config/microsoft.js';
import {
  saveMicrosoftTokens,
  deleteMicrosoftTokens,
  hasMicrosoftTokens,
} from '../utils/microsoftTokenStore.js';

export function microsoftConnect(req, res) {
  // Pass userId as state so Microsoft echoes it back — no cookie or HMAC needed.
  // requireAuth on the callback already validates the session (CSRF protection).
  res.redirect(getMicrosoftAuthUrl(req.user.id));
}

export async function microsoftCallback(req, res) {
  const { code, error } = req.query;

  if (error) {
    console.error('Microsoft OAuth error:', error);
    return res.redirect(
      `${process.env.FRONTEND_URL}/dashboard?ms_error=${encodeURIComponent(error)}`
    );
  }

  if (!code) {
    return res.redirect(`${process.env.FRONTEND_URL}/dashboard?ms_error=no_code`);
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
