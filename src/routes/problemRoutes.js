const { Router } = require('express');
const {
  createProblem,
  getAllProblems,
  getProblemById,
  resolveProblem,
  deleteProblem,
  exportProblems,
  updateProblem,
} = require('../controllers/problemController');
const { requireAuth } = require('../middlewares/authMiddleware');

const router = Router();

// POST   /api/problems              – murojaat yuborish (Ochiq - barcha xodimlar uchun)
router.post('/', createProblem);

// GET    /api/problems/export       – Excel yuklab olish (Faqat IT Support / Manager)
// MUHIM: Bu yo'l /:id dan OLDIN joylashishi kerak!
router.get('/export', requireAuth, exportProblems);

// GET    /api/problems              – barcha murojaatlar (Faqat IT Support / Manager)
router.get('/', requireAuth, getAllProblems);

// GET    /api/problems/:id          – bitta murojaat (Faqat IT Support / Manager)
router.get('/:id', requireAuth, getProblemById);

// PATCH  /api/problems/:id          – murojaatni tahrirlash (Faqat IT Support / Manager)
router.patch('/:id', requireAuth, updateProblem);

// PATCH  /api/problems/:id/resolve  – hal qilindi (Faqat IT Support / Manager)
router.patch('/:id/resolve', requireAuth, resolveProblem);

// DELETE /api/problems/:id          – o'chirish (Faqat IT Support / Manager)
router.delete('/:id', requireAuth, deleteProblem);

module.exports = router;



