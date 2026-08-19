const jwt    = require('jsonwebtoken');
const prisma = require('../lib/prisma');

// ─────────────────────────────────────────────
// JWT orqali autentifikatsiya (har ikki rol)
// Header: Authorization: Bearer <token>
// ─────────────────────────────────────────────
async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

    if (!token) {
      return res.status(401).json({ success: false, message: 'Kirish uchun token talab qilinadi' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      const message = err.name === 'TokenExpiredError'
        ? 'Sessiya muddati tugagan, qayta kiring'
        : "Noto'g'ri token";
      return res.status(401).json({ success: false, message });
    }

    // Foydalanuvchi hali ham mavjudligini tekshirish
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, fullName: true, phone: true, role: true },
    });

    if (!user) {
      return res.status(401).json({ success: false, message: 'Foydalanuvchi topilmadi' });
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

// ─────────────────────────────────────────────
// Faqat Manager uchun
// ─────────────────────────────────────────────
async function requireManagerAuth(req, res, next) {
  await requireAuth(req, res, async () => {
    if (req.user?.role !== 'MANAGER') {
      return res.status(403).json({ success: false, message: 'Faqat Manager uchun ruxsat berilgan' });
    }
    next();
  });
}

module.exports = { requireAuth, requireManagerAuth };
