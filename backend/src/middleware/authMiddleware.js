import { verifyAuthToken } from '../utils/jwt.js';
import { prisma } from '../config/db.js';

export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies.session;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    const payload = verifyAuthToken(token);

    // Reject tokens issued before the user's last logout (invalidates sessions after logout)
    if (payload.iat) {
      const user = await prisma.user.findUnique({
        where: { id: payload.id },
        select: { lastLogoutAt: true },
      });
      if (user?.lastLogoutAt && payload.iat * 1000 < user.lastLogoutAt.getTime()) {
        return res.status(401).json({ error: 'Session expired, please log in again' });
      }
    }

    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Not authenticated' });
  }
}
