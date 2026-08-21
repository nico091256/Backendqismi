const { Router } = require('express');
const { 
  register, 
  login, 
  logout, 
  getMe, 
  updateProfile, 
  changePassword, 
  resetAllUsers,
  getRegistrationStatus,
  setRegistrationStatus
} = require('../controllers/authController');
const { requireAuth, requireManagerAuth } = require('../middlewares/authMiddleware');
const { validate, registerSchema, loginSchema } = require('../middlewares/validateMiddleware');

const router = Router();

// GET /api/auth/registration-status — Registratsiya holatini tekshirish (Ochiq/Yopiq)
router.get('/registration-status', getRegistrationStatus);

// PATCH /api/auth/registration-status — Registratsiyani ochish/yopish (Faqat Manager)
router.patch('/registration-status', requireManagerAuth, setRegistrationStatus);

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

// POST /api/auth/reset-users — Barcha userlarni tozalash (Admin secret bilan)
router.post('/reset-users', resetAllUsers);

module.exports = router;


