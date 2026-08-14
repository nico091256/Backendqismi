function requireAdminAuth(req, res, next) {
  const adminKey = req.headers['x-admin-key'] || req.headers['authorization'];
  const expectedPassword = process.env.ADMIN_PASSWORD || 'ITadmin2026';

  if (!adminKey || adminKey !== expectedPassword) {
    return res.status(401).json({
      success: false,
      message: "Ruxsat yo'q. Noto'g'ri admin paroli kiritilgan.",
    });
  }

  next();
}

module.exports = { requireAdminAuth };
