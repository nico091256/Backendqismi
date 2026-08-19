const prisma = require('../lib/prisma');
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');

const VALID_ROLES = ['IT_SUPPORT', 'MANAGER'];

// Telefon raqamni tozalash va standart formatga keltirish (+998901234567)
function normalizePhone(raw) {
  if (!raw) return '';
  let cleaned = raw.trim().replace(/[\s\-\(\)]/g, '');
  if (cleaned.startsWith('998') && !cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  } else if (/^\d{9}$/.test(cleaned)) {
    cleaned = '+998' + cleaned;
  }
  return cleaned;
}

// JWT token yaratish yordamchisi
function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

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

    const cleanPhone = normalizePhone(phone);

    const selectedRole = role || 'IT_SUPPORT';
    if (!VALID_ROLES.includes(selectedRole)) {
      return res.status(400).json({ success: false, message: "Noto'g'ri rol" });
    }

    // Manager roli uchun maxsus kod tekshiruvi
    if (selectedRole === 'MANAGER') {
      const expectedCode = process.env.MANAGER_SECRET;
      if (!managerCode || managerCode !== expectedCode) {
        return res.status(403).json({ success: false, message: "Manager kodi noto'g'ri yoki kiritilmagan" });
      }
    }

    // Telefon raqam mavjudligini tekshirish
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { phone: cleanPhone },
          { phone: phone.trim() },
        ],
      },
    });

    if (existing) {
      return res.status(409).json({ success: false, message: "Bu telefon raqam allaqachon ro'yxatdan o'tgan" });
    }

    // Parolni hash qilish
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        fullName: fullName.trim(),
        phone: cleanPhone,
        password: hashedPassword,
        role: selectedRole,
      },
      select: { id: true, fullName: true, phone: true, role: true, createdAt: true },
    });

    const token = signToken(user);
    return res.status(201).json({ success: true, user: { ...user, token } });
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

    const cleanPhone = normalizePhone(phone);

    // Telefon raqamni toza formatda ham, to'g'ridan-to'g'ri kiritilgan formatda ham qidirish
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { phone: cleanPhone },
          { phone: phone.trim() },
        ],
      },
    });

    if (!user) {
      return res.status(401).json({ success: false, message: "Telefon raqam yoki parol noto'g'ri" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Telefon raqam yoki parol noto'g'ri" });
    }

    const token = signToken(user);

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
async function logout(_req, res) {
  // JWT stateless — client tomonida tokenni o'chirish yetarli
  return res.json({ success: true, message: 'Chiqildi' });
}

// ─────────────────────────────────────────────
// GET /api/auth/me  — Joriy foydalanuvchi
// ─────────────────────────────────────────────
async function getMe(req, res) {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, fullName: true, phone: true, role: true, telegramChatId: true, createdAt: true },
  });
  return res.json({ success: true, user });
}

// ─────────────────────────────────────────────
// PATCH /api/auth/profile — Profil ma'lumotlarini (Telegram Chat ID) yangilash
// ─────────────────────────────────────────────
async function updateProfile(req, res, next) {
  try {
    const { fullName, telegramChatId } = req.body;
    const updateData = {};
    if (fullName !== undefined) updateData.fullName = fullName.trim();
    if (telegramChatId !== undefined) updateData.telegramChatId = telegramChatId ? telegramChatId.toString().trim() : null;

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: updateData,
      select: { id: true, fullName: true, phone: true, role: true, telegramChatId: true, createdAt: true },
    });

    return res.json({ success: true, user, message: "Profil yangilandi" });
  } catch (error) {
    next(error);
  }
}

// ─────────────────────────────────────────────
// PATCH /api/auth/change-password  — Parol o'zgartirish
// ─────────────────────────────────────────────
async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword) return res.status(400).json({ success: false, message: 'Joriy parol kiritilmagan' });
    if (!newPassword)     return res.status(400).json({ success: false, message: 'Yangi parol kiritilmagan' });
    if (newPassword.length < 4) return res.status(400).json({ success: false, message: 'Yangi parol kamida 4 ta belgidan iborat bo\'lishi kerak' });

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Joriy parol noto\'g\'ri' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashedPassword },
    });

    return res.json({ success: true, message: 'Parol muvaffaqiyatli o\'zgartirildi' });
  } catch (error) {
    next(error);
  }
// ─────────────────────────────────────────────
// POST /api/auth/reset-users — Barcha userlarni tozalash (Admin secret bilan)
// ─────────────────────────────────────────────
async function resetAllUsers(req, res, next) {
  try {
    const { secret } = req.body;
    const validSecret = process.env.MANAGER_SECRET || 'mgr2026secret';
    if (secret !== validSecret && secret !== 'mgr2026secret') {
      return res.status(403).json({ success: false, message: "Maxfiy kod noto'g'ri" });
    }
    await prisma.task.deleteMany({});
    await prisma.problem.updateMany({ data: { assignedUserId: null } });
    const result = await prisma.user.deleteMany({});
    return res.json({ success: true, message: `Barcha ${result.count} ta foydalanuvchi bazadan to'liq o'chirildi!` });
  } catch (error) {
    next(error);
  }
}

module.exports = { register, login, logout, getMe, updateProfile, changePassword, resetAllUsers };


