const { Router } = require('express');
const { getStats } = require('../controllers/problemController');
const { requireAuth } = require('../middlewares/authMiddleware');

const router = Router();

// GET /api/stats?year=2026 — Hisobotlar statistikasi (IT Support / Manager)
router.get('/', requireAuth, getStats);

module.exports = router;
