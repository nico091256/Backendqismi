const { Router } = require('express');
const {
  createProblem,
  getAllProblems,
  getProblemById,
  resolveProblem,
  deleteProblem,
  exportProblems,
  updateProblem,
  checkTicket,
  getNewCount,
  assignProblem,
} = require('../controllers/problemController');
const { requireAuth, requireManagerAuth } = require('../middlewares/authMiddleware');

const router = Router();

// POST   /api/problems              – murojaat yuborish (Ochiq - barcha xodimlar uchun)
router.post('/', createProblem);

// GET    /api/problems/check/:ticket – Ticket holati (Ochiq - autentifikatsiyasiz)
router.get('/check/:ticket', checkTicket);

// GET    /api/problems/new-count    – Yangi murojaatlar soni (polling, auth kerak)
router.get('/new-count', requireAuth, getNewCount);

// GET    /api/problems/export       – Excel yuklab olish
// MUHIM: Bu yo'l /:id dan OLDIN joylashishi kerak!
router.get('/export', requireAuth, exportProblems);

// GET    /api/problems              – barcha murojaatlar
router.get('/', requireAuth, getAllProblems);

// GET    /api/problems/:id          – bitta murojaat
router.get('/:id', requireAuth, getProblemById);

// PATCH  /api/problems/:id/assign   – xodimga biriktirish
router.patch('/:id/assign', requireAuth, assignProblem);

// PATCH  /api/problems/:id/resolve  – hal qilindi
router.patch('/:id/resolve', requireAuth, resolveProblem);

// PATCH  /api/problems/:id          – tahrirlash
router.patch('/:id', requireAuth, updateProblem);

// DELETE /api/problems/:id          – o'chirish
router.delete('/:id', requireAuth, deleteProblem);

module.exports = router;



