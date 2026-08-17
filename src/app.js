require('dotenv').config();

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const problemRoutes = require('./routes/problemRoutes');
const authRoutes    = require('./routes/authRoutes');
const taskRoutes    = require('./routes/taskRoutes');

const app = express();

// ─────────────────────────────────────────────
// CORS (Bulletproof for Cloudflare, Vercel, Render)
// ─────────────────────────────────────────────
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS, PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With, Origin');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});


// ─────────────────────────────────────────────
// Body parser
// ─────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ─────────────────────────────────────────────
// Rate limiting
// ─────────────────────────────────────────────
const isDev = process.env.NODE_ENV !== 'production';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 2000, // 2000 requests per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => isDev || req.ip === '::1' || req.ip === '127.0.0.1' || req.ip === '::ffff:127.0.0.1',
  message: { success: false, message: 'Too many requests, please try again later.' },
});

app.use('/api/', limiter);

// ─────────────────────────────────────────────
// Health check
// ─────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ success: true, message: 'IT Support API is running' });
});

const { requireAuth } = require('./middlewares/authMiddleware');

// ─────────────────────────────────────────────
// API routes
// ─────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/problems', problemRoutes);

// GET /api/users — Foydalanuvchilar ro'yxati (Manager uchun)
app.get('/api/users', requireAuth, require('./controllers/taskController').getUsers);

// DELETE /api/users/:id — Xodim hisobini o'chirish (Manager uchun)
app.delete('/api/users/:id', requireAuth, require('./controllers/taskController').deleteUser);

// GET /api/stats — Hisobotlar (IT Support)
app.get('/api/stats', requireAuth, require('./controllers/problemController').getStats);

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
