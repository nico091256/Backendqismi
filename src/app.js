require('dotenv').config();

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const problemRoutes = require('./routes/problemRoutes');

const app = express();

// ─────────────────────────────────────────────
// CORS
// ─────────────────────────────────────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:5174'];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow server-to-server, localhost ports, and configured origins
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
      ) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin "${origin}" is not allowed`));
      }
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-admin-key', 'Authorization', 'Accept'],
    credentials: true,
  })
);

// ─────────────────────────────────────────────
// Body parser
// ─────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ─────────────────────────────────────────────
// Rate limiting – 100 requests / 15 min per IP
// ─────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

// ─────────────────────────────────────────────
// Health check
// ─────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ success: true, message: 'IT Support API is running' });
});

const { requireAdminAuth } = require('./middlewares/authMiddleware');

// ─────────────────────────────────────────────
// Admin Auth Verification
// ─────────────────────────────────────────────
app.post('/api/auth/verify-admin', (req, res) => {
  const { password } = req.body;
  const expectedPassword = process.env.ADMIN_PASSWORD || 'ITadmin2026';

  if (!password || password !== expectedPassword) {
    return res.status(401).json({ success: false, message: "Noto'g'ri admin paroli" });
  }

  res.json({ success: true, message: 'Admin paroli tasdiqlandi' });
});

// ─────────────────────────────────────────────
// API routes
// ─────────────────────────────────────────────
app.use('/api/problems', problemRoutes);

// GET /api/stats  –  Analytics & reports (Faqat IT Support)
app.get('/api/stats', requireAdminAuth, require('./controllers/problemController').getStats);

// ─────────────────────────────────────────────
// 404 handler – unknown routes
// ─────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ─────────────────────────────────────────────
// Centralized error handler
// ─────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const isDev = process.env.NODE_ENV !== 'production';

  console.error('[ERROR]', err.message);

  res.status(err.status || 500).json({
    success: false,
    message: isDev ? err.message : 'An unexpected error occurred',
  });
});

module.exports = app;
