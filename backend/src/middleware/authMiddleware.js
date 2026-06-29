import { verifyAuthToken } from "../utils/jwt.js";

export function requireAuth(req, res, next) {
  try {
    const token = req.cookies.session;

    if (!token) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    req.user = verifyAuthToken(token);
    next();
  } catch {
    res.status(401).json({ error: "Not authenticated" });
  }
}
