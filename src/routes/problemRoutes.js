const { Router } = require('express');
const {
  createProblem,
  getAllProblems,
  getProblemById,
  resolveProblem,
  deleteProblem,
} = require('../controllers/problemController');
const { requireAdminAuth } = require('../middlewares/authMiddleware');

const router = Router();

// POST   /api/problems              – submit a new problem (Ochiq - barcha xodimlar uchun)
router.post('/', createProblem);

// GET    /api/problems              – list all problems (Faqat IT Support)
router.get('/', requireAdminAuth, getAllProblems);

// GET    /api/problems/:id          – get one problem (Faqat IT Support)
router.get('/:id', requireAdminAuth, getProblemById);

// PATCH  /api/problems/:id/resolve  – mark as resolved (Faqat IT Support)
router.patch('/:id/resolve', requireAdminAuth, resolveProblem);

// DELETE /api/problems/:id          – delete permanently (Faqat IT Support)
router.delete('/:id', requireAdminAuth, deleteProblem);

module.exports = router;

