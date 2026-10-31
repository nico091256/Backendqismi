/**
 * Telegram bot fon ishchisi (long-polling getUpdates).
 * Vazifasi: deep-link orqali foydalanuvchi hisobini tizimga ulash.
 *
 *   /start link_<userId>_<imzo>  -> hisobni ulash (imzo HMAC bilan tekshiriladi,
 *                                    begona odam o'zini boshqa xodim sifatida ulay olmaydi)
 *   /stop yoki /unlink           -> hisobni uzish
 *   /chatid yoki /id             -> joriy Chat ID ni ko'rsatish (qo'lda ulash uchun)
 *
 * TELEGRAM_BOT_TOKEN bo'lmasa — jimgina ishga tushmaydi, server normal davom etadi.
 */
const crypto = require('crypto');
const prisma = require('./prisma');
const { callTelegramApi, escapeHtml } = require('./telegram');

let botUsername = null;
let running = false;
let offset = 0;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Deep-link imzosi: faqat server (JWT_SECRET egasi) yarata oladi
function linkSignature(userId) {
  const secret = process.env.JWT_SECRET || '';
  return crypto.createHmac('sha256', secret).update(`tg-link:${userId}`).digest('hex').slice(0, 16);
}

/** Profil sahifasi uchun ulash havolasi (bot hali ulanmagan bo'lsa null) */
function buildDeepLink(userId) {
  if (!botUsername) return null;
  return `https://t.me/${botUsername}?start=link_${userId}_${linkSignature(userId)}`;
}

function getBotUsername() {
  return botUsername;
}

async function reply(chatId, text) {
  await callTelegramApi('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
}

// /start [payload]
async function handleStart(chatId, payload) {
  if (payload && payload.startsWith('link_')) {
    const parts = payload.split('_'); // ["link", "<userId>", "<sig>"]
    const userId = parseInt(parts[1], 10);
    const sig = parts[2] || '';
    if (!isNaN(userId) && sig) {
      const expected = linkSignature(userId);
      const valid =
        sig.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
      if (valid) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (user) {
          await prisma.user.update({
            where: { id: userId },
            data: { telegramChatId: String(chatId) },
          });
          await reply(
            chatId,
            `✅ Tabriklaymiz! Sizning Telegram hisobingiz tizimga (F.I.Sh: <b>${escapeHtml(user.fullName)}</b>) muvaffaqiyatli ulandi. Endi barcha muhim bildirishnomalarni shu yerda olasiz.\n\n` +
              `🔕 Uzish uchun istalgan vaqtda /stop buyrug'ini yuboring.`
          );
          console.log(`[TelegramBot] Hisob ulandi: userId=${userId}, chatId=${chatId}`);
          return;
        }
      }
    }
    await reply(
      chatId,
      `❌ Ulanish havolasi noto'g'ri yoki eskirgan. Iltimos, IT Support panelidagi Profil sahifasiga kirib, «Telegram Botni ulash» tugmasidan qaytadan foydalaning.`
    );
    return;
  }

  await reply(
    chatId,
    `👋 Salom! Bu — IT Support bildirishnoma boti.\n\n` +
      `Hisobingizni ulash uchun IT Support panelidagi <b>Profil</b> sahifasiga kiring va «Telegram Botni ulash» tugmasini bosing.\n\n` +
      `🆔 Qo'lda ulash uchun Chat ID raqamingiz: <code>${chatId}</code>`
  );
}

// /stop yoki /unlink
async function handleUnlink(chatId) {
  const result = await prisma.user.updateMany({
    where: { telegramChatId: String(chatId) },
    data: { telegramChatId: null },
  });
  if (result.count > 0) {
    await reply(
      chatId,
      `🔕 Telegram hisobingiz tizimdan uzildi. Endi bildirishnomalar kelmaydi.\n\nQayta ulash uchun Profil sahifasidagi «Telegram Botni ulash» tugmasidan foydalaning.`
    );
    console.log(`[TelegramBot] Hisob uzildi: chatId=${chatId} (${result.count} ta foydalanuvchi)`);
  } else {
    await reply(chatId, `ℹ️ Bu Telegram hisobi tizimga ulanmagan.`);
  }
}

async function pollLoop() {
  while (running) {
    try {
      const res = await callTelegramApi(
        'getUpdates',
        { offset, timeout: 30, allowed_updates: ['message'] },
        { timeoutMs: 40000, silent: true }
      );

      if (!res.ok) {
        if (res.error_code === 409) {
          console.warn(
            '[TelegramBot] 409: bu token bilan boshqa getUpdates/webhook faol. 30 soniyadan keyin qayta urinaman.'
          );
          await sleep(30000);
        } else {
          await sleep(5000);
        }
        continue;
      }

      for (const update of res.result || []) {
        offset = update.update_id + 1;
        const msg = update.message;
        if (!msg || !msg.text || !msg.chat) continue;

        const chatId = msg.chat.id;
        const text = msg.text.trim();
        try {
          if (text.startsWith('/start')) {
            await handleStart(chatId, text.slice(6).trim());
          } else if (text === '/stop' || text === '/unlink') {
            await handleUnlink(chatId);
          } else if (text === '/chatid' || text === '/id') {
            await reply(chatId, `🆔 Sizning Chat ID raqamingiz: <code>${chatId}</code>`);
          }
        } catch (err) {
          console.warn('[TelegramBot] buyruqni qayta ishlashda xato:', err.message);
        }
      }
    } catch (err) {
      console.warn('[TelegramBot] polling xatosi:', err.message);
      await sleep(5000);
    }
  }
}

/** Serverda chaqiriladi. Token yo'q/yaroqsiz bo'lsa server normal davom etadi. */
async function startTelegramBot() {
  try {
    const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
    if (!token) {
      console.log("ℹ️  [TelegramBot] TELEGRAM_BOT_TOKEN o'rnatilmagan — bot ishga tushirilmadi");
      return;
    }

    // Token validatsiyasi va bot username'ini olish
    const me = await callTelegramApi('getMe', {});
    if (!me.ok) {
      console.warn('[TelegramBot] Token yaroqsiz — bot ishga tushirilmadi:', me.description || me.reason);
      return;
    }

    botUsername = me.result.username;
    running = true;
    console.log(`✅  [TelegramBot] @${botUsername} ulandi — deep-link va buyruqlar faol`);

    // Fonda ishlaydi, await qilinmaydi
    pollLoop();
  } catch (err) {
    console.warn('[TelegramBot] ishga tushirishda xato:', err.message);
  }
}

module.exports = { startTelegramBot, getBotUsername, buildDeepLink };
