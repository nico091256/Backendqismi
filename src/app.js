require('dotenv').config();

const express    = require('express');
const rateLimit  = require('express-rate-limit');

const problemRoutes = require('./routes/problemRoutes');
const authRoutes    = require('./routes/authRoutes');
const taskRoutes    = require('./routes/taskRoutes');
const userRoutes    = require('./routes/userRoutes');
const statsRoutes   = require('./routes/statsRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const chatRoutes      = require('./routes/chatRoutes');

const app = express();

// ─────────────────────────────────────────────
// CORS — faqat ruxsat etilgan originlar
// ─────────────────────────────────────────────
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const isDev = process.env.NODE_ENV !== 'production';

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (isDev || !origin || ALLOWED_ORIGINS.includes(origin)) {
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    else        res.setHeader('Access-Control-Allow-Origin', '*');
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
// Body parser (25MB limit rasm va fayllar uchun)
// ─────────────────────────────────────────────
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '25mb', extended: true }));

// ─────────────────────────────────────────────
// Rate limiting
// ─────────────────────────────────────────────

// Umumiy limit
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 daqiqa
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => isDev || req.ip === '::1' || req.ip === '127.0.0.1' || req.ip === '::ffff:127.0.0.1',
  message: { success: false, message: "Juda ko'p so'rov. Iltimos, keyinroq urinib ko'ring." },
});

// Login uchun qattiqroq limit
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 daqiqa
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => isDev || req.ip === '::1' || req.ip === '127.0.0.1' || req.ip === '::ffff:127.0.0.1',
  message: { success: false, message: "Juda ko'p urinish. 15 daqiqadan keyin qayta urinib ko'ring." },
});

app.use('/api/', limiter);
app.use('/api/auth/login',    authLimiter);
app.use('/api/auth/register', authLimiter);

// ─────────────────────────────────────────────
// Health check
// ─────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ success: true, message: 'IT Support API is running' });
});

// ─────────────────────────────────────────────
// API routes
// ─────────────────────────────────────────────
app.use('/api/auth',     authRoutes);
app.use('/api/tasks',    taskRoutes);
app.use('/api/problems', problemRoutes);
app.use('/api/users',    userRoutes);
app.use('/api/stats',    statsRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/chat',      chatRoutes);

// ─────────────────────────────────────────────
// 404 handler
// ─────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ─────────────────────────────────────────────
// Centralized error handler
// ─────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.message);

  res.status(err.status || 500).json({
    success: false,
    message: isDev ? err.message : 'An unexpected error occurred',
  });
});

module.exports = app;
