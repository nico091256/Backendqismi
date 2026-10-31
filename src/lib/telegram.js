const https = require('https');

const DEFAULT_TIMEOUT_MS = 10000;

// Tokenni .env dan olish (qo'shtirnoq va bo'sh joylardan tozalab)
function getToken() {
  let token = process.env.TELEGRAM_BOT_TOKEN;
  if (token) token = token.trim().replace(/^["']|["']$/g, '');
  return token || null;
}

// HTML parse_mode uchun dinamik (foydalanuvchi kiritgan) matnni xavfsizlash
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Telegram Bot API ga umumiy so'rov.
 * MUHIM: hech qachon reject qilmaydi — har doim { ok, ... } obyekti bilan resolve
 * bo'ladi. Shu sababli Telegram xatosi (429, timeout, token yo'qligi) asosiy
 * biznes-jarayonni hech qachon yiqitmaydi yoki orqaga qaytarmaydi.
 */
function callTelegramApi(method, payload = {}, { timeoutMs = DEFAULT_TIMEOUT_MS, silent = false } = {}) {
  const token = getToken();
  if (!token) {
    if (!silent) console.warn(`[Telegram] TELEGRAM_BOT_TOKEN o'rnatilmagan — ${method} bajarilmadi`);
    return Promise.resolve({ ok: false, reason: 'No token configured' });
  }

  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${token}/${method}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: timeoutMs,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (!parsed.ok && !silent) {
              if (res.statusCode === 429) {
                const retryAfter = parsed.parameters && parsed.parameters.retry_after;
                console.warn(`[Telegram] Rate limit (429) — ${method}, retry_after=${retryAfter || '?'}s`);
              } else {
                console.warn(`[Telegram] ${method} xatosi:`, parsed.description || `HTTP ${res.statusCode}`);
              }
            }
            resolve(parsed);
          } catch (e) {
            resolve({ ok: false, reason: "Javobni o'qib bo'lmadi: " + e.message });
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error(`Telegram API timeout (${timeoutMs}ms)`));
    });
    req.on('error', (err) => {
      if (!silent) console.warn(`[Telegram] ulanish xatosi (${method}):`, err.message);
      resolve({ ok: false, reason: err.message });
    });

    req.write(body);
    req.end();
  });
}

/**
 * Formatlangan xabar yuborish (HTML, havola-preview o'chirilgan).
 * options.button = { text, url } berilsa, xabarga inline tugma biriktiriladi.
 * @param {string|number} chatId
 * @param {string} text (HTML; dinamik qismlar oldindan escapeHtml qilingan bo'lishi kerak)
 */
async function sendTelegramNotification(chatId, text, options = {}) {
  try {
    if (!chatId) return { success: false, reason: 'No chatId' };

    const payload = {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    };
    if (options.button && options.button.url) {
      payload.reply_markup = {
        inline_keyboard: [[{ text: options.button.text || '📄 Ochish', url: options.button.url }]],
      };
    }

    const res = await callTelegramApi('sendMessage', payload);
    if (res.ok) {
      console.log('[Telegram Notification] Yuborildi:', chatId);
      return { success: true };
    }
    return { success: false, reason: res.description || res.reason };
  } catch (err) {
    // callTelegramApi reject qilmaydi — bu qo'shimcha himoya qatlami xolos
    console.warn('[Telegram Notification] kutilmagan xato:', err.message);
    return { success: false, reason: err.message };
  }
}

/** Rasm yuborish (URL ko'rinishida bo'lsa sendPhoto, aks holda matnli xabar) */
async function sendTelegramPhoto(chatId, photoBufferOrUrl, caption = '') {
  try {
    if (!chatId) return { success: false, reason: 'No chatId' };

    if (typeof photoBufferOrUrl === 'string' && photoBufferOrUrl.startsWith('http')) {
      const res = await callTelegramApi('sendPhoto', {
        chat_id: chatId,
        photo: photoBufferOrUrl,
        caption,
        parse_mode: 'HTML',
      });
      return { success: Boolean(res.ok) };
    }

    return sendTelegramNotification(chatId, caption);
  } catch (err) {
    console.warn('[Telegram Photo] kutilmagan xato:', err.message);
    return { success: false, reason: err.message };
  }
}

module.exports = { sendTelegramNotification, sendTelegramPhoto, callTelegramApi, escapeHtml };
