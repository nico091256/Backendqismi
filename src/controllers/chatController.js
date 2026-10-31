const fs = require('fs');
const path = require('path');
const { notifyChatMessage } = require('../lib/notifications');

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

    // Telegram: guruhga va barcha ulangan xodimlarga — fon rejimida
    notifyChatMessage(sender, newMessage.message, Boolean(image));

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
