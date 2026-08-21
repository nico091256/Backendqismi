const { Router } = require('express');
const { getUsers, deleteUser } = require('../controllers/taskController');
const { requireAuth, requireManagerAuth } = require('../middlewares/authMiddleware');

const router = Router();

// GET /api/users?role=IT_SUPPORT — Foydalanuvchilar ro'yxati (IT Support & Manager)
router.get('/', requireAuth, getUsers);

// DELETE /api/users/:id — Xodim hisobini o'chirish (Manager uchun)
router.delete('/:id', requireManagerAuth, deleteUser);

module.exports = router;
