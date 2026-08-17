const { Router } = require('express');
const { getTasks, createTask, updateTaskStatus, deleteTask, getUsers } = require('../controllers/taskController');
const { requireAuth, requireManagerAuth } = require('../middlewares/authMiddleware');

const router = Router();

// GET /api/tasks — Topshiriqlar (Manager: hammasi, IT_SUPPORT: o'zinikiler)
router.get('/', requireAuth, getTasks);

// POST /api/tasks — Topshiriq yaratish (faqat Manager)
router.post('/', requireManagerAuth, createTask);

// PATCH /api/tasks/:id/status — Status yangilash (IT Support yoki Manager)
router.patch('/:id/status', requireAuth, updateTaskStatus);

// DELETE /api/tasks/:id — O'chirish (faqat Manager)
router.delete('/:id', requireManagerAuth, deleteTask);

module.exports = router;
