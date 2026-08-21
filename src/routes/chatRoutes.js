const { Router } = require('express');
const { getChatMessages, sendChatMessage } = require('../controllers/chatController');
const { requireAuth } = require('../middlewares/authMiddleware');

const router = Router();

// GET /api/chat — Xabarlarni o'qish (faqat tizimga kirgan IT xodimlar va Manager)
router.get('/', requireAuth, getChatMessages);

// POST /api/chat — Xabar yuborish (va Telegram botga jo'natish)
router.post('/', requireAuth, sendChatMessage);

module.exports = router;
