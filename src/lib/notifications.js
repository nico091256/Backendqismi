/**
 * Markazlashtirilgan Telegram bildirishnomalari (lifecycle events).
 * Barcha funksiyalar fail-safe: ichki try/catch bilan o'ralgan, hech qachon
 * throw qilmaydi va asosiy biznes-jarayonni bloklamaydi (fire-and-forget).
 * Dinamik maydonlar HTML-injection buzilishlariga qarshi escape qilinadi.
 */
const prisma = require('./prisma');
const { sendTelegramNotification, escapeHtml: esc } = require('./telegram');

function frontendUrl() {
  return (process.env.FRONTEND_URL || 'https://ticket.di.uz').trim().replace(/\/+$/, '');
}

function openButton(text, path) {
  return { button: { text, url: `${frontendUrl()}${path}` } };
}

function fmtDateTime(d = new Date()) {
  return new Date(d).toLocaleString('uz-UZ');
}

// Tizimda Telegram ulangan barcha foydalanuvchilarga yuborish
async function broadcastToLinkedUsers(text, options) {
  const users = await prisma.user.findMany({
    where: { telegramChatId: { not: null } },
    select: { telegramChatId: true },
  });
  const sends = users
    .filter((u) => u.telegramChatId && u.telegramChatId.trim())
    .map((u) => sendTelegramNotification(u.telegramChatId.trim(), text, options));
  await Promise.allSettled(sends);
}

/** 🔔 Yangi murojaat kelib tushdi — barcha ulangan xodimlarga */
async function notifyNewProblem(problem) {
  try {
    const isTM = problem.type === 'Texnik muammo';
    const text =
      `🔔 <b>YANGI MUROJAAT KELIB TUSHDI!</b>\n\n` +
      `📋 <b>Ticket:</b> <code>${esc(problem.ticketNumber)}</code> (${esc(problem.type)})\n` +
      `👤 <b>Xodim:</b> ${esc(problem.lastName)} ${esc(problem.firstName)} ${esc(problem.middleName || '')}\n` +
      `🏢 <b>Obyekt / Bo'lim:</b> ${esc(problem.objectName || '—')}\n` +
      (isTM
        ? `🚪 <b>Xona:</b> ${esc(problem.room || '—')} | 🖥️ <b>PC:</b> ${esc(problem.computer || '—')}\n`
        : `📦 <b>Jihoz:</b> ${esc(problem.requestedItem || '—')} (${problem.quantity || 1} ta)\n`) +
      `📞 <b>Telefon:</b> ${esc(problem.phone || '—')}\n\n` +
      (problem.description ? `📝 <b>Tavsif:</b>\n<i>${esc(problem.description)}</i>\n\n` : '') +
      `⏰ <b>Kelgan vaqti:</b> ${fmtDateTime()}`;
    await broadcastToLinkedUsers(text, openButton('📄 Murojaatni ochish', '/admin/admin'));
  } catch (err) {
    console.warn('[Notify] notifyNewProblem xatosi:', err.message);
  }
}

/** 📥 Murojaat xodimga biriktirildi — o'sha xodimga */
async function notifyProblemAssigned(worker, problem) {
  try {
    if (!worker || !worker.telegramChatId) return;
    const isTM = problem.type === 'Texnik muammo';
    const text =
      `📥 <b>SIZGA YANGI MUROJAAT BIRIKTIRILDI</b>\n\n` +
      `📋 <b>Ticket:</b> <code>${esc(problem.ticketNumber)}</code> (${esc(problem.type)})\n` +
      `👤 <b>Xodim:</b> ${esc(problem.lastName)} ${esc(problem.firstName)} ${esc(problem.middleName || '')}\n` +
      `🏢 <b>Obyekt:</b> ${esc(problem.objectName || '—')}\n` +
      (isTM
        ? `🚪 <b>Xona:</b> ${esc(problem.room || '—')} | 🖥️ <b>PC:</b> ${esc(problem.computer || '—')}\n`
        : `📦 <b>Jihoz:</b> ${esc(problem.requestedItem || '—')} (${problem.quantity || 1} ta)\n`) +
      `📞 <b>Telefon:</b> ${esc(problem.phone || '—')}\n\n` +
      (problem.description ? `📝 <b>Tavsif:</b>\n<i>${esc(problem.description)}</i>\n\n` : '') +
      `⏰ <b>Biriktirilgan vaqt:</b> ${fmtDateTime()}`;
    await sendTelegramNotification(
      worker.telegramChatId.trim(),
      text,
      openButton('📄 Murojaatni ochish', '/admin/admin')
    );
  } catch (err) {
    console.warn('[Notify] notifyProblemAssigned xatosi:', err.message);
  }
}

/** 📋 Yangi topshiriq — biriktirilgan xodimga */
async function notifyTaskAssigned(task, worker, managerName) {
  try {
    if (!worker || !worker.telegramChatId) return;
    const priorityIcons = {
      URGENT: '🔴 Shoshilinch',
      HIGH: '🟡 Yuqori',
      NORMAL: '🔵 Normal',
      LOW: '🟢 Past',
    };
    const dlStr = task.deadline ? new Date(task.deadline).toLocaleDateString('uz-UZ') : 'Belgilanmagan';
    const text =
      `📋 <b>SIZGA YANGI TOPSHIRIQ YUKLANDI</b>\n\n` +
      `📌 <b>Sarlavha:</b> ${esc(task.title)}\n` +
      `⚡ <b>Muhimlik darajasi:</b> ${priorityIcons[task.priority] || esc(task.priority)}\n` +
      `📅 <b>Muddat (Deadline):</b> ${dlStr}\n\n` +
      `📝 <b>Topshiriq tavsifi:</b>\n<i>${esc(task.description)}</i>\n\n` +
      `👔 <b>Topshiruvchi:</b> ${esc(managerName)} (Manager)\n` +
      `⏰ <b>Vaqti:</b> ${fmtDateTime()}`;
    await sendTelegramNotification(
      worker.telegramChatId.trim(),
      text,
      openButton('📋 Topshiriqni ochish', '/admin/tasks')
    );
  } catch (err) {
    console.warn('[Notify] notifyTaskAssigned xatosi:', err.message);
  }
}

/** 💬 Jamoa chatidagi yangi xabar — guruhga va barcha ulangan xodimlarga */
async function notifyChatMessage(sender, message, hasImage) {
  try {
    const timeStr = new Date().toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
    const roleIcon = sender.role === 'MANAGER' ? '👑 Manager' : '👨‍💻 IT Mutaxassis';
    const textSnippet = message && message.trim() ? `📝 <i>« ${esc(message.trim())} »</i>\n` : '';
    const imageSnippet = hasImage ? `📸 <i>[Rasm biriktirilgan]</i>\n` : '';
    const text =
      `💬 <b>IT Jamoa Chati — Yangi Xabar</b>\n\n` +
      `👤 <b>${esc(sender.fullName || 'Xodim')}</b> (${roleIcon})\n\n` +
      `${textSnippet}${imageSnippet}\n🕒 ${timeStr}`;
    const btn = openButton('💬 Chatni ochish', '/admin/chat');

    // 1) .env da guruh ID bo'lsa — guruhga
    const groupChatId = process.env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_GROUP_CHAT_ID;
    if (groupChatId) sendTelegramNotification(groupChatId, text, btn);

    // 2) Barcha ulangan xodimlarga
    await broadcastToLinkedUsers(text, btn);
  } catch (err) {
    console.warn('[Notify] notifyChatMessage xatosi:', err.message);
  }
}

/** ⏳ Topshiriq muddatiga 24 soatdan kam qoldi — biriktirilgan xodimga */
async function notifyTaskDeadlineWarning(task) {
  try {
    const worker = task.worker;
    if (!worker || !worker.telegramChatId) return;
    const dlStr = new Date(task.deadline).toLocaleString('uz-UZ');
    const text =
      `⏳ <b>DIQQAT: TOPSHIRIQ MUDDATI YAQINLASHMOQDA!</b>\n\n` +
      `📌 <b>Sarlavha:</b> ${esc(task.title)}\n` +
      `📅 <b>Muddat:</b> ${dlStr}\n` +
      `⚠️ Muddat tugashiga <b>24 soatdan kam</b> vaqt qoldi.\n\n` +
      `Iltimos, topshiriqni o'z vaqtida yakunlang.`;
    await sendTelegramNotification(
      worker.telegramChatId.trim(),
      text,
      openButton('📋 Topshiriqni ochish', '/admin/tasks')
    );
  } catch (err) {
    console.warn('[Notify] notifyTaskDeadlineWarning xatosi:', err.message);
  }
}

/** 🔴 Topshiriq muddati o'tib ketdi — biriktirilgan xodimga */
async function notifyTaskDeadlineExpired(task) {
  try {
    const worker = task.worker;
    if (!worker || !worker.telegramChatId) return;
    const dlStr = new Date(task.deadline).toLocaleString('uz-UZ');
    const text =
      `🔴 <b>TOPSHIRIQ MUDDATI O'TIB KETDI!</b>\n\n` +
      `📌 <b>Sarlavha:</b> ${esc(task.title)}\n` +
      `📅 <b>Muddat edi:</b> ${dlStr}\n\n` +
      `Iltimos, topshiriqni zudlik bilan yakunlang yoki rahbaringizni xabardor qiling.`;
    await sendTelegramNotification(
      worker.telegramChatId.trim(),
      text,
      openButton('📋 Topshiriqni ochish', '/admin/tasks')
    );
  } catch (err) {
    console.warn('[Notify] notifyTaskDeadlineExpired xatosi:', err.message);
  }
}

module.exports = {
  notifyNewProblem,
  notifyProblemAssigned,
  notifyTaskAssigned,
  notifyChatMessage,
  notifyTaskDeadlineWarning,
  notifyTaskDeadlineExpired,
};
