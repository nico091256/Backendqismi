const { Router } = require('express');
const { register, login, logout, getMe } = require('../controllers/authController');
const { requireAuth } = require('../middlewares/authMiddleware');

const router = Router();

// POST /api/auth/register — Ro'yxatdan o'tish
router.post('/register', register);

// POST /api/auth/login — Kirish
router.post('/login', login);

// POST /api/auth/logout — Chiqish
router.post('/logout', logout);

// GET /api/auth/me — Joriy foydalanuvchi
router.get('/me', requireAuth, getMe);

module.exports = router;
