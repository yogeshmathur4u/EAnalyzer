import { prisma } from '../config/db.js';
import { encrypt, decrypt } from './encryption.js';

export async function saveTokens(userId, googleTokens) {
  const encryptedAccessToken = encrypt(googleTokens.access_token);
  const encryptedRefreshToken = encrypt(googleTokens.refresh_token);

  await prisma.googleToken.upsert({
    where: { userId },
    create: {
      userId,
      accessToken: encryptedAccessToken,
      refreshToken: encryptedRefreshToken,
      scope: googleTokens.scope,
      tokenType: googleTokens.token_type,
      expiryDate: googleTokens.expiry_date ? BigInt(googleTokens.expiry_date) : null,
    },
    update: {
      accessToken: encryptedAccessToken,
      // Google only returns a refresh_token on the first consent; keep the existing one otherwise.
      ...(encryptedRefreshToken ? { refreshToken: encryptedRefreshToken } : {}),
      scope: googleTokens.scope,
      tokenType: googleTokens.token_type,
      expiryDate: googleTokens.expiry_date ? BigInt(googleTokens.expiry_date) : null,
    },
  });
}

export async function getTokens(userId) {
  const row = await prisma.googleToken.findUnique({ where: { userId } });
  if (!row) return null;

  return {
    access_token: decrypt(row.accessToken),
    refresh_token: decrypt(row.refreshToken),
    scope: row.scope,
    token_type: row.tokenType,
    expiry_date: row.expiryDate ? Number(row.expiryDate) : undefined,
  };
}
