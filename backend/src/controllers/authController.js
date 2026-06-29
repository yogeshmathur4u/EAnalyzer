import crypto from 'crypto';
import { google } from 'googleapis';
import { createOAuth2Client, GOOGLE_SCOPES } from '../config/google.js';
import { signAuthToken } from '../utils/jwt.js';
import { saveTokens } from '../utils/tokenStore.js';
import { prisma } from '../config/db.js';

const STATE_COOKIE = 'oauth_state';
const SESSION_COOKIE = 'session';
const isProd = process.env.NODE_ENV === 'production';

export function googleAuth(req, res) {
  const oauth2Client = createOAuth2Client();
  const state = crypto.randomBytes(16).toString('hex');

  res.cookie(STATE_COOKIE, state, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 5 * 60 * 1000,
  });

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: GOOGLE_SCOPES,
    state,
  });

  res.redirect(authUrl);
}

export async function googleCallback(req, res) {
  const oauth2Client = createOAuth2Client();
  const { code, state } = req.query;
  const expectedState = req.cookies[STATE_COOKIE];

  if (!state || !expectedState || state !== expectedState) {
    return res.status(403).json({ error: 'Invalid or missing OAuth state' });
  }

  res.clearCookie(STATE_COOKIE);

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: profile } = await oauth2.userinfo.get();

    await prisma.user.upsert({
      where: { id: profile.id },
      create: {
        id: profile.id,
        email: profile.email,
        name: profile.name,
        picture: profile.picture,
      },
      update: {
        email: profile.email,
        name: profile.name,
        picture: profile.picture,
      },
    });

    await saveTokens(profile.id, tokens);

    const sessionToken = signAuthToken({
      id: profile.id,
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
    });

    res.cookie(SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
  } catch (err) {
    console.error('Google OAuth callback failed:', err);
    res.status(500).json({ error: 'OAuth callback failed' });
  }
}

export function me(req, res) {
  res.status(200).json({ user: req.user });
}

export function logout(req, res) {
  res.clearCookie(SESSION_COOKIE);
  res.status(204).end();
}
