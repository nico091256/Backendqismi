const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const prisma = new PrismaClient();

const VALID_ROLES = ['IT_SUPPORT', 'MANAGER'];

// ─────────────────────────────────────────────
// POST /api/auth/register
// ─────────────────────────────────────────────
async function register(req, res, next) {
  try {
    const { fullName, phone, password, role, managerCode } = req.body;

    // Validatsiya
    if (!fullName?.trim())  return res.status(400).json({ success: false, message: 'Ism kiritilmagan' });
    if (!phone?.trim())     return res.status(400).json({ success: false, message: 'Telefon raqam kiritilmagan' });
    if (!password?.trim())  return res.status(400).json({ success: false, message: 'Parol kiritilmagan' });
    if (password.length < 4) return res.status(400).json({ success: false, message: "Parol kamida 4 ta belgidan iborat bo'lishi kerak" });

    const selectedRole = role || 'IT_SUPPORT';
    if (!VALID_ROLES.includes(selectedRole)) {
      return res.status(400).json({ success: false, message: "Noto'g'ri rol" });
    }

    // Manager roli uchun maxsus kod tekshiruvi
    if (selectedRole === 'MANAGER') {
      const expectedCode = process.env.MANAGER_SECRET || 'mgr2026secret';
      if (!managerCode || managerCode !== expectedCode) {
        return res.status(403).json({ success: false, message: "Manager kodi noto'g'ri yoki kiritilmagan" });
      }
    }

    // Telefon raqam mavjudligini tekshirish
    const existing = await prisma.user.findUnique({ where: { phone: phone.trim() } });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Bu telefon raqam allaqachon ro\'yxatdan o\'tgan' });
    }

    // Parolni hash qilish
    const hashedPassword = await bcrypt.hash(password, 10);
    const token = uuidv4();

    const user = await prisma.user.create({
      data: {
        fullName: fullName.trim(),
        phone: phone.trim(),
        password: hashedPassword,
        role: selectedRole,
        token,
      },
      select: { id: true, fullName: true, phone: true, role: true, token: true, createdAt: true },
    });

    return res.status(201).json({ success: true, user });
  } catch (error) {
    next(error);
  }
}

// ─────────────────────────────────────────────
// POST /api/auth/login
// ─────────────────────────────────────────────
async function login(req, res, next) {
  try {
    const { phone, password } = req.body;

    if (!phone?.trim())    return res.status(400).json({ success: false, message: 'Telefon raqam kiritilmagan' });
    if (!password?.trim()) return res.status(400).json({ success: false, message: 'Parol kiritilmagan' });

    const user = await prisma.user.findUnique({ where: { phone: phone.trim() } });

    if (!user) {
      return res.status(401).json({ success: false, message: "Telefon raqam yoki parol noto'g'ri" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Telefon raqam yoki parol noto'g'ri" });
    }

    // Yangi token generatsiya
    const token = uuidv4();
    await prisma.user.update({ where: { id: user.id }, data: { token } });

    return res.json({
      success: true,
      user: { id: user.id, fullName: user.fullName, phone: user.phone, role: user.role, token },
    });
  } catch (error) {
    next(error);
  }
}

// ─────────────────────────────────────────────
// POST /api/auth/logout
// ─────────────────────────────────────────────
async function logout(req, res, next) {
  try {
    const token = req.headers['authorization']?.replace('Bearer ', '');
    if (token) {
      await prisma.user.updateMany({ where: { token }, data: { token: null } });
    }
    return res.json({ success: true, message: 'Chiqildi' });
  } catch (error) {
    next(error);
  }
}

// ─────────────────────────────────────────────
// GET /api/auth/me  — Joriy foydalanuvchi
// ─────────────────────────────────────────────
async function getMe(req, res) {
  return res.json({ success: true, user: req.user });
}

module.exports = { register, login, logout, getMe };
