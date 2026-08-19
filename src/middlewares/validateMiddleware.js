const { z } = require('zod');

// ─────────────────────────────────────────────
// Validatsiya middleware factory
// ─────────────────────────────────────────────
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const firstError = result.error.issues[0];
      return res.status(400).json({
        success: false,
        message: firstError.message,
        field: firstError.path[0] || null,
      });
    }
    req.body = result.data; // tozalangan va transformatsiya qilingan ma'lumotlar
    next();
  };
}

// ─────────────────────────────────────────────
// Auth schemalar
// ─────────────────────────────────────────────
const registerSchema = z.object({
  fullName:    z.string({ required_error: 'Ism kiritilmagan' }).trim().min(2, 'Ism kamida 2 ta harf'),
  phone:       z.string({ required_error: 'Telefon raqam kiritilmagan' }).trim().min(9, 'Telefon raqam noto\'g\'ri'),
  password:    z.string({ required_error: 'Parol kiritilmagan' }).min(4, 'Parol kamida 4 ta belgidan iborat bo\'lishi kerak'),
  role:        z.enum(['IT_SUPPORT', 'MANAGER']).optional().default('IT_SUPPORT'),
  managerCode: z.string().optional(),
});

const loginSchema = z.object({
  phone:    z.string({ required_error: 'Telefon raqam kiritilmagan' }).trim().min(9, 'Telefon raqam noto\'g\'ri'),
  password: z.string({ required_error: 'Parol kiritilmagan' }).min(1, 'Parol kiritilmagan'),
});

module.exports = { validate, registerSchema, loginSchema };
