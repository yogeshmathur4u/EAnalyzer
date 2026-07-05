import { prisma } from '../config/db.js';
import { encrypt, decrypt } from './encryption.js';
import { refreshMicrosoftTokens } from '../config/microsoft.js';

export async function saveMicrosoftTokens(userId, tokens) {
  const expiryDate = tokens.expires_in
    ? BigInt(Date.now() + tokens.expires_in * 1000)
    : null;

  await prisma.microsoftToken.upsert({
    where: { userId },
    create: {
      userId,
      accessToken: encrypt(tokens.access_token),
      refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
      scope: tokens.scope,
      tokenType: tokens.token_type,
      expiryDate,
    },
    update: {
      accessToken: encrypt(tokens.access_token),
      ...(tokens.refresh_token ? { refreshToken: encrypt(tokens.refresh_token) } : {}),
      scope: tokens.scope,
      tokenType: tokens.token_type,
      expiryDate,
    },
  });
}

export async function getMicrosoftTokens(userId) {
  const row = await prisma.microsoftToken.findUnique({ where: { userId } });
  if (!row) return null;

  const expiryDate = row.expiryDate ? Number(row.expiryDate) : null;
  const isExpired = expiryDate && Date.now() >= expiryDate - 60_000;

  if (isExpired && row.refreshToken) {
    const currentRefreshToken = decrypt(row.refreshToken);
    const refreshed = await refreshMicrosoftTokens(currentRefreshToken);
    await saveMicrosoftTokens(userId, refreshed);
    return {
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token || currentRefreshToken,
    };
  }

  return {
    access_token: decrypt(row.accessToken),
    refresh_token: row.refreshToken ? decrypt(row.refreshToken) : null,
  };
}

export async function deleteMicrosoftTokens(userId) {
  await prisma.microsoftToken.deleteMany({ where: { userId } });
}

export async function hasMicrosoftTokens(userId) {
  const count = await prisma.microsoftToken.count({ where: { userId } });
  return count > 0;
}
