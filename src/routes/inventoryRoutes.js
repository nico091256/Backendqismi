const { Router } = require('express');
const {
  getAllInventory,
  getInventoryStats,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  exportInventoryExcel
} = require('../controllers/inventoryController');

const router = Router();

// GET /api/inventory/stats – statistikalar
router.get('/stats', getInventoryStats);

// GET /api/inventory/export – Excel yuklab olish
router.get('/export', exportInventoryExcel);

// GET /api/inventory – ro'yxat
router.get('/', getAllInventory);

// POST /api/inventory – yangi qo'shish
router.post('/', createInventoryItem);

// PATCH /api/inventory/:id – tahrirlash
router.patch('/:id', updateInventoryItem);

// DELETE /api/inventory/:id – o'chirish
router.delete('/:id', deleteInventoryItem);

module.exports = router;
