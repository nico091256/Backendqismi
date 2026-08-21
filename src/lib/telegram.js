const https = require('https');

/**
 * Send a formatted message to a Telegram User/Chat
 * @param {string|number} chatId
 * @param {string} text (HTML supported)
 */
async function sendTelegramNotification(chatId, text) {
  let token = process.env.TELEGRAM_BOT_TOKEN;
  if (token) {
    token = token.trim().replace(/^["']|["']$/g, '');
  }
  // Agar Render.com da kiritilmagan bo'lsa zaxira token
  if (!token) {
    token = '8974099262:AAHwpvd0kPMppTRxo1ZC0PcsgSqgOQDts2w';
  }

  if (!chatId) {
    return { success: false, reason: 'No chatId' };
  }

  return new Promise((resolve) => {
    const payload = JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
    });

    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: '/bot' + token + '/sendMessage',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.ok) {
            console.log('[Telegram Notification] Yuborildi:', chatId);
            resolve({ success: true });
          } else {
            console.warn('[Telegram Notification Error]', parsed.description);
            resolve({ success: false, reason: parsed.description });
          }
        } catch (e) {
          resolve({ success: false, reason: e.message });
        }
      });
    });

    req.on('error', (err) => {
      console.warn('[Telegram Connection Error]', err.message);
      resolve({ success: false, reason: err.message });
    });

    req.write(payload);
    req.end();
  });
}

/**
 * Send photo to Telegram User/Chat
 */
async function sendTelegramPhoto(chatId, photoBufferOrUrl, caption = '') {
  let token = process.env.TELEGRAM_BOT_TOKEN;
  if (token) {
    token = token.trim().replace(/^["']|["']$/g, '');
  }
  if (!token) {
    token = '8974099262:AAHwpvd0kPMppTRxo1ZC0PcsgSqgOQDts2w';
  }

  if (!chatId) return { success: false, reason: 'No chatId' };

  // If photo is a URL
  if (typeof photoBufferOrUrl === 'string' && photoBufferOrUrl.startsWith('http')) {
    return new Promise((resolve) => {
      const payload = JSON.stringify({
        chat_id: chatId,
        photo: photoBufferOrUrl,
        caption: caption,
        parse_mode: 'HTML',
      });

      const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: '/bot' + token + '/sendPhoto',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve({ success: parsed.ok });
          } catch {
            resolve({ success: false });
          }
        });
      });
      req.on('error', () => resolve({ success: false }));
      req.write(payload);
      req.end();
    });
  }

  return sendTelegramNotification(chatId, caption);
}

module.exports = { sendTelegramNotification, sendTelegramPhoto };
