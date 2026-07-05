import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/authRoutes.js';
import gmailRoutes from './routes/gmailRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import microsoftAuthRoutes from './routes/microsoftAuthRoutes.js';
import outlookRoutes from './routes/outlookRoutes.js';

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/auth', authRoutes);
app.use('/auth/microsoft', microsoftAuthRoutes);
app.use('/gmail', gmailRoutes);
app.use('/outlook', outlookRoutes);
app.use('/ai', aiRoutes);

export default app;
