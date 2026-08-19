const { Router } = require('express');
const { register, login, logout, getMe, updateProfile, changePassword } = require('../controllers/authController');
const { requireAuth } = require('../middlewares/authMiddleware');
const { validate, registerSchema, loginSchema } = require('../middlewares/validateMiddleware');

const router = Router();

// POST /api/auth/register — Ro'yxatdan o'tish
router.post('/register', validate(registerSchema), register);

// POST /api/auth/login — Kirish
router.post('/login', validate(loginSchema), login);

// POST /api/auth/logout — Chiqish
router.post('/logout', logout);

// GET /api/auth/me — Joriy foydalanuvchi
router.get('/me', requireAuth, getMe);

// PATCH /api/auth/profile — Profil ma'lumotlarini (Telegram Chat ID) yangilash
router.patch('/profile', requireAuth, updateProfile);

// PATCH /api/auth/change-password — Parol o'zgartirish
router.patch('/change-password', requireAuth, changePassword);

module.exports = router;

