const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// ─────────────────────────────────────────────
// Token orqali autentifikatsiya (har ikki rol)
// Header: Authorization: Bearer <token>
// ─────────────────────────────────────────────
async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

    if (!token) {
      return res.status(401).json({ success: false, message: "Kirish uchun token talab qilinadi" });
    }

    const user = await prisma.user.findUnique({
      where: { token },
      select: { id: true, fullName: true, phone: true, role: true, token: true },
    });

    if (!user) {
      return res.status(401).json({ success: false, message: "Sessiya muddati tugagan yoki noto'g'ri token" });
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
      return res.status(403).json({ success: false, message: "Faqat Manager uchun ruxsat berilgan" });
    }
    next();
  });
}

module.exports = { requireAuth, requireManagerAuth };
