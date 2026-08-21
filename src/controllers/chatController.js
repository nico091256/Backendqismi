const fs = require('fs');
const path = require('path');
const prisma = require('../lib/prisma');
const { sendTelegramNotification } = require('../lib/telegram');

const CHAT_DATA_FILE = path.join(__dirname, '../data/chatMessages.json');

function readChatMessages() {
  try {
    if (fs.existsSync(CHAT_DATA_FILE)) {
      const raw = fs.readFileSync(CHAT_DATA_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error reading chatMessages.json:', err);
  }
  return [];
}

function saveChatMessages(messages) {
  try {
    // Keep last 500 messages
    const trimmed = messages.slice(-500);
    fs.writeFileSync(CHAT_DATA_FILE, JSON.stringify(trimmed, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving chatMessages.json:', err);
  }
}

// GET /api/chat — Xabarlar tarixini olish
async function getChatMessages(req, res) {
  try {
    const messages = readChatMessages();
    res.json({
      success: true,
      messages
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// POST /api/chat — Yangi xabar yuborish va Telegram botga uzatish
async function sendChatMessage(req, res) {
  try {
    const { message, image } = req.body;
    if ((!message || !message.trim()) && !image) {
      return res.status(400).json({ success: false, message: "Xabar matni yoki rasm kiritilishi shart" });
    }

    const sender = req.user; // from requireAuth middleware
    const messages = readChatMessages();

    const newMessage = {
      id: Date.now(),
      senderId: sender.id,
      senderName: sender.fullName || 'IT Xodim',
      senderRole: sender.role || 'IT_SUPPORT',
      message: (message || '').trim(),
      image: image || null,
      createdAt: new Date().toISOString()
    };

    messages.push(newMessage);
    saveChatMessages(messages);

    // ── Telegram Bot orqali barcha IT xodimlarga / guruhga xabar yuborish ──
    const timeStr = new Date().toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
    const roleIcon = sender.role === 'MANAGER' ? '👑 Manager' : '👨‍💻 IT Mutaxassis';
    const textSnippet = message?.trim() ? `📝 <i>« ${message.trim()} »</i>\n` : '';
    const imageSnippet = image ? `📸 <i>[Rasm biriktirilgan]</i>\n` : '';
    const tgText = `💬 <b>IT Jamoa Chati — Yangi Xabar</b>\n\n👤 <b>${sender.fullName || 'Xodim'}</b> (${roleIcon})\n\n${textSnippet}${imageSnippet}\n🕒 ${timeStr} | ticket.di.uz/admin`;

    try {
      // 1. Agar .env da guruh ID bo'lsa
      const groupChatId = process.env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_GROUP_CHAT_ID;
      if (groupChatId) {
        sendTelegramNotification(groupChatId, tgText).catch(() => {});
      }

      // 2. Tizimdagi barcha telegram ulangan xodimlarga yuborish
      const itUsers = await prisma.user.findMany({
        where: { telegramChatId: { not: null } },
        select: { telegramChatId: true, id: true }
      });

      itUsers
        .filter(u => u.telegramChatId && u.telegramChatId.trim())
        .forEach(u => {
          sendTelegramNotification(u.telegramChatId.trim(), tgText).catch(() => {});
        });
    } catch (tgErr) {
      console.warn('Telegram notification error in chat:', tgErr.message);
    }

    res.status(201).json({
      success: true,
      message: newMessage
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = {
  getChatMessages,
  sendChatMessage
};
