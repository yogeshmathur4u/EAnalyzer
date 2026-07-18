import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import authRoutes from './routes/authRoutes.js';
import gmailRoutes from './routes/gmailRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import microsoftAuthRoutes from './routes/microsoftAuthRoutes.js';
import outlookRoutes from './routes/outlookRoutes.js';

const app = express();

// ── Security headers ──────────────────────────────────────────────────────────
app.use(
  helmet({
    frameguard: { action: 'deny' },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https://lh3.googleusercontent.com'],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
      },
    },
  })
);

// ── CORS — restricted to frontend origin only ─────────────────────────────────
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));

app.use(express.json());
app.use(cookieParser());

// ── Rate limiting ─────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// Sync/consent operations fan out to external APIs (Gmail, Graph, Gemini) and
// DB writes. Limit to 30/min to protect API quota and prevent resource exhaustion.
const emailLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/auth', authLimiter, authRoutes);
app.use('/auth/microsoft', authLimiter, microsoftAuthRoutes);
app.use('/gmail', emailLimiter, gmailRoutes);
app.use('/outlook', emailLimiter, outlookRoutes);
app.use('/ai', aiLimiter, aiRoutes);

export default app;
