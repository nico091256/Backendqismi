const prisma = require('../lib/prisma');
const ExcelJS = require('exceljs');
const { sendTelegramNotification } = require('../lib/telegram');

// Ruxsat etilgan murojaat turlari
const VALID_TYPES = ["Texnik muammo", "Jihoz so'rovi"];

// ─────────────────────────────────────────────
// Helper – tur bo'yicha alohida ticket raqam
// "Texnik muammo" → TM-1001, TM-1002 ...
// "Jihoz so'rovi" → JS-1001, JS-1002 ...
// ─────────────────────────────────────────────
async function generateTicketNumber(type) {
  const prefix = type === "Jihoz so'rovi" ? 'JS' : 'TM';
  
  const lastProblem = await prisma.problem.findFirst({
    where: { ticketNumber: { startsWith: `${prefix}-` } },
    orderBy: { id: 'desc' },
    select: { ticketNumber: true },
  });

  let nextNum = 1001;
  if (lastProblem && lastProblem.ticketNumber) {
    const parts = lastProblem.ticketNumber.split('-');
    const parsed = parseInt(parts[1], 10);
    if (!isNaN(parsed)) {
      nextNum = parsed + 1;
    }
  }

  while (true) {
    const candidate = `${prefix}-${nextNum}`;
    const exists = await prisma.problem.findUnique({ where: { ticketNumber: candidate } });
    if (!exists) return candidate;
    nextNum++;
  }
}

// ─────────────────────────────────────────────
// POST /api/problems  –  Yangi murojaat yaratish
// ─────────────────────────────────────────────
async function createProblem(req, res, next) {
  try {
    const {
      type = "Texnik muammo",
      // Shaxsiy ma'lumotlar
      lastName, firstName, middleName,
      position, objectName, phone,
      // Texnik muammo uchun
      room, computer, description,
      // Jihoz so'rovi uchun
      requestedItem, quantity,
    } = req.body;

    // Tur tekshiruvi
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({
        success: false,
        message: `Murojaat turi noto'g'ri. "${VALID_TYPES.join('" yoki "')}" bo'lishi kerak.`,
      });
    }

    // Shaxsiy ma'lumotlar tekshiruvi (ikki tur uchun ham majburiy)
    if (!lastName?.toString().trim())  return res.status(400).json({ success: false, message: 'Familiya kiritilmagan' });
    if (!firstName?.toString().trim()) return res.status(400).json({ success: false, message: 'Ism kiritilmagan' });
    if (!middleName?.toString().trim()) return res.status(400).json({ success: false, message: 'Sharif kiritilmagan' });
    if (!position?.toString().trim())  return res.status(400).json({ success: false, message: 'Lavozim kiritilmagan' });
    if (!objectName?.toString().trim()) return res.status(400).json({ success: false, message: 'Obyekt nomi kiritilmagan' });
    if (!phone?.toString().trim())     return res.status(400).json({ success: false, message: 'Telefon raqami kiritilmagan' });

    // Tur bo'yicha qo'shimcha tekshiruv
    if (type === "Texnik muammo") {
      if (!room?.toString().trim())        return res.status(400).json({ success: false, message: 'Xona raqami kiritilmagan' });
      if (!computer?.toString().trim())    return res.status(400).json({ success: false, message: 'Kompyuter nomi kiritilmagan' });
      if (!description?.toString().trim()) return res.status(400).json({ success: false, message: 'Muammo tavsifi kiritilmagan' });
    } else {
      if (!requestedItem?.toString().trim()) return res.status(400).json({ success: false, message: "So'ralgan jihoz nomi kiritilmagan" });
    }

    const ticketNumber = await generateTicketNumber(type);

    const problem = await prisma.problem.create({
      data: {
        ticketNumber,
        type,
        lastName:  lastName.toString().trim(),
        firstName: firstName.toString().trim(),
        middleName: middleName.toString().trim(),
        position:  position.toString().trim(),
        objectName: objectName.toString().trim(),
        phone:     phone.toString().trim(),
        room:          room?.toString().trim()          || null,
        computer:      computer?.toString().trim()      || null,
        description:   description?.toString().trim()   || null,
        requestedItem: requestedItem?.toString().trim() || null,
        quantity:      quantity ? parseInt(quantity, 10) : null,
        status: 'NEW',
      },
    });

    // Yangi murojaat kelib tushishi bilan barcha ulangan xodimlarga / botga bildirishnoma yuborish
    try {
      const usersWithTg = await prisma.user.findMany({
        where: { telegramChatId: { not: null } },
        select: { telegramChatId: true },
      });

      if (usersWithTg.length > 0) {
        const isTM = problem.type === 'Texnik muammo';
        const text = `🔔 <b>YANGI MUROJAAT KELIB TUSHDI!</b>\n\n` +
          `📋 <b>Ticket:</b> <code>${problem.ticketNumber}</code> (${problem.type})\n` +
          `👤 <b>Xodim:</b> ${problem.lastName} ${problem.firstName} ${problem.middleName || ''}\n` +
          `🏢 <b>Obyekt / Bo'lim:</b> ${problem.objectName || '—'}\n` +
          (isTM ? `🚪 <b>Xona:</b> ${problem.room || '—'} | 🖥️ <b>PC:</b> ${problem.computer || '—'}\n` : `📦 <b>Jihoz:</b> ${problem.requestedItem || '—'} (${problem.quantity || 1} ta)\n`) +
          `📞 <b>Telefon:</b> ${problem.phone || '—'}\n\n` +
          (problem.description ? `📝 <b>Tavsif:</b>\n<i>${problem.description}</i>\n\n` : '') +
          `⏰ <b>Kelgan vaqti:</b> ${new Date().toLocaleString('uz-UZ')}`;

        const promises = usersWithTg
          .filter(u => u.telegramChatId && u.telegramChatId.trim())
          .map(u => sendTelegramNotification(u.telegramChatId.trim(), text));

        await Promise.allSettled(promises);
      }
    } catch (e) {
      console.warn('[Telegram Broadcast Warn]', e.message);
    }

    return res.status(201).json({ success: true, problem });
  } catch (error) {
    next(error);
  }
}

// ─────────────────────────────────────────────
// GET /api/problems  –  Barcha murojaatlar (yangilari birinchi)
// Query: ?type=, ?status=, ?room=, ?search=
// ─────────────────────────────────────────────
async function getAllProblems(req, res, next) {
  try {
    const { type, status, room, search } = req.query;

    const where = {};
    if (type)   where.type   = type;
    if (status) where.status = status.toUpperCase();
    if (room)   where.room   = room;
    if (search) {
      where.OR = [
        { firstName:    { contains: search } },
        { lastName:     { contains: search } },
        { middleName:   { contains: search } },
        { objectName:   { contains: search } },
        { phone:        { contains: search } },
        { description:  { contains: search } },
        { requestedItem:{ contains: search } },
        { room:         { contains: search } },
        { computer:     { contains: search } },
      ];
    }

    const problems = await prisma.problem.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { assignedUser: { select: { id: true, fullName: true, phone: true } } },
    });

    return res.json({ success: true, problems });
  } catch (error) {
    next(error);
  }
}

// ─────────────────────────────────────────────
// GET /api/problems/:id  –  Bitta murojaat
// ─────────────────────────────────────────────
async function getProblemById(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid problem ID' });
    }

    const problem = await prisma.problem.findUnique({ where: { id } });

    if (!problem) {
      return res.status(404).json({ success: false, message: 'Problem not found' });
    }

    return res.json({ success: true, problem });
  } catch (error) {
    next(error);
  }
}

const fs = require('fs');
const path = require('path');

const INVENTORY_FILE_BACKEND = path.join(__dirname, '../data/inventoryData.json');
const INVENTORY_FILE_FRONTEND = path.join(__dirname, '../../../frontend/src/data/inventoryData.json');

function cyrillicToLatin(text) {
  if (!text) return '';
  let str = String(text);
  const map = {
    'ў': "o'", 'Ў': "O'", 'ғ': "g'", 'Ғ': "G'", 'ш': 'sh', 'Ш': 'Sh', 'ч': 'ch', 'Ч': 'Ch',
    'ю': 'yu', 'Ю': 'Yu', 'я': 'ya', 'Ya': 'Ya', 'ё': 'yo', 'Ё': 'Yo', 'ж': 'j', 'Ж': 'J',
    'х': 'x', 'Х': 'X', 'ҳ': 'h', 'Ҳ': 'H', 'қ': 'q', 'Қ': 'Q', 'э': 'e', 'Э': 'E',
    'е': 'e', 'Е': 'E', 'а': 'a', 'А': 'A', 'б': 'b', 'Б': 'B', 'в': 'v', 'В': 'V',
    'г': 'g', 'Г': 'G', 'д': 'd', 'Д': 'D', 'з': 'z', 'З': 'Z', 'и': 'i', 'И': 'I',
    'й': 'y', 'Й': 'Y', 'к': 'k', 'К': 'K', 'л': 'l', 'Л': 'L', 'м': 'm', 'М': 'M',
    'н': 'n', 'Н': 'N', 'о': 'o', 'О': 'O', 'п': 'p', 'П': 'P', 'р': 'r', 'Р': 'R',
    'с': 's', 'С': 'S', 'т': 't', 'Т': 'T', 'у': 'u', 'У': 'U', 'ф': 'f', 'Ф': 'F',
    'ц': 'ts', 'Ц': 'Ts', 'щ': 'sh', 'Щ': 'Sh', 'ъ': "'", 'Ъ': "'", 'ь': '', 'Ь': '',
    'ы': 'i', 'Ы': 'I'
  };
  let res = '';
  for (let i = 0; i < str.length; i++) {
    res += map[str[i]] !== undefined ? map[str[i]] : str[i];
  }
  return res;
}

function normalizeName(name) {
  if (!name) return '';
  let latin = cyrillicToLatin(name).toLowerCase();
  latin = latin.replace(/[`'ʻʼʽ]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const words = latin.split(' ').filter(w => !['ogli', 'og\'li', 'qizi', 'ugli', 'u', 'o', 'g', 'q', 'ovich', 'evich', 'ovna', 'evna'].includes(w));
  return words.join(' ');
}

function toTitleCase(str) {
  if (!str) return '';
  return str.split(/([\s\-'])/).map(word => {
    if (!word || /^[\s\-']$/.test(word)) return word;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join('');
}

function formatPhone(phoneRaw) {
  if (!phoneRaw) return { phone: '', rawPhone: '' };
  let str = String(phoneRaw).replace(/\D/g, '');
  if (!str) return { phone: '', rawPhone: '' };
  if (str.length === 9) {
    str = '998' + str;
  }
  if (str.length === 12 && str.startsWith('998')) {
    const formatted = `+998 (${str.slice(3, 5)}) ${str.slice(5, 8)}-${str.slice(8, 10)}-${str.slice(10, 12)}`;
    return { phone: formatted, rawPhone: str };
  }
  return { phone: String(phoneRaw).trim(), rawPhone: str };
}

function syncResolvedEquipmentToInventory(problem) {
  try {
    if (!fs.existsSync(INVENTORY_FILE_BACKEND)) return null;
    const raw = fs.readFileSync(INVENTORY_FILE_BACKEND, 'utf-8');
    const items = JSON.parse(raw);

    const problemFullName = `${problem.lastName || ''} ${problem.firstName || ''} ${problem.middleName || ''}`.trim();
    const probNorm = normalizeName(problemFullName);
    const probWords = probNorm.split(' ').filter(w => w.length > 2);

    let existingIndex = items.findIndex(it => {
      const itNorm = normalizeName(it.fullName);
      if (itNorm === probNorm) return true;
      const itWords = itNorm.split(' ').filter(w => w.length > 2);
      if (probWords.length >= 2 && itWords.length >= 2) {
        if (probWords[0] === itWords[0] && probWords[1] === itWords[1]) return true;
        if (probWords[0] === itWords[1] && probWords[1] === itWords[0]) return true;
      }
      if (problem.phone && it.rawPhone) {
        const cleanProbPhone = String(problem.phone).replace(/\D/g, '');
        if (cleanProbPhone.length >= 9 && it.rawPhone.includes(cleanProbPhone.slice(-9))) return true;
      }
      return false;
    });

    const itemDesc = problem.requestedItem || problem.description || '';
    const isMonitor = /monitor|дюйм|artel|samsung|immer|lg|philips|avtech|redmi|viewsonic|22|24|27|32/i.test(itemDesc);
    const isPrinter = /printer|принтер|canon|epson|hp\s*laser|pantum|xerox|mf3010|l1800|l1300/i.test(itemDesc);
    const isLaptop = /laptop|noutbuk|ноутбук|vivobook|aspire|thinkpad|ideapad|macbook|probook/i.test(itemDesc);
    const isPC = /kompyuter|компьютер|pc|tizim\s*blok|core\s*i|ryzen/i.test(itemDesc);

    let updatedOrCreatedItem = null;

    if (existingIndex !== -1) {
      const current = items[existingIndex];
      let monitor1 = current.monitor1 || '';
      let monitor2 = current.monitor2 || '';
      let printer = current.printer || '';
      let pcSpecs = current.pcSpecs || '';
      let deviceType = current.deviceType || 'PC';

      if (isMonitor) {
        if (!monitor1) {
          monitor1 = toTitleCase(cyrillicToLatin(itemDesc));
        } else if (!monitor2) {
          monitor2 = toTitleCase(cyrillicToLatin(itemDesc));
        } else {
          monitor2 = `${monitor2}, ${toTitleCase(cyrillicToLatin(itemDesc))}`;
        }
      } else if (isPrinter) {
        if (!printer) {
          printer = toTitleCase(cyrillicToLatin(itemDesc));
        } else {
          printer = `${printer}, ${toTitleCase(cyrillicToLatin(itemDesc))}`;
        }
      } else if (isLaptop) {
        deviceType = 'Laptop';
        pcSpecs = pcSpecs ? `${pcSpecs} (${itemDesc})` : toTitleCase(cyrillicToLatin(itemDesc));
      } else if (isPC) {
        deviceType = 'PC';
        pcSpecs = pcSpecs ? `${pcSpecs}, ${itemDesc}` : toTitleCase(cyrillicToLatin(itemDesc));
      } else {
        pcSpecs = pcSpecs ? `${pcSpecs} + ${itemDesc}` : toTitleCase(cyrillicToLatin(itemDesc));
      }

      const monitorCount = (monitor1 ? 1 : 0) + (monitor2 ? 1 : 0);

      items[existingIndex] = {
        ...current,
        phone: current.phone || formatPhone(problem.phone).phone,
        rawPhone: current.rawPhone || formatPhone(problem.phone).rawPhone,
        position: (!current.position || current.position === 'Xodim') && problem.position ? toTitleCase(cyrillicToLatin(problem.position)) : current.position,
        objectName: (!current.objectName || current.objectName === 'Bosh ofis') && problem.objectName ? toTitleCase(cyrillicToLatin(problem.objectName)) : (current.objectName || 'Bosh ofis'),
        monitor1,
        monitor2,
        monitorCount,
        printer,
        pcSpecs,
        deviceType,
        updatedAt: new Date().toISOString(),
      };
      updatedOrCreatedItem = items[existingIndex];
    } else {
      const maxId = items.length > 0 ? Math.max(...items.map(i => i.id || 0)) + 1 : 1;
      const phoneObj = formatPhone(problem.phone);

      let monitor1 = isMonitor ? toTitleCase(cyrillicToLatin(itemDesc)) : '';
      let monitor2 = '';
      let printer = isPrinter ? toTitleCase(cyrillicToLatin(itemDesc)) : '';
      let pcSpecs = (isPC || isLaptop || (!isMonitor && !isPrinter)) ? toTitleCase(cyrillicToLatin(itemDesc)) : '';
      let deviceType = isLaptop ? 'Laptop' : (isPC ? 'PC' : (pcSpecs ? 'PC' : "Noma'lum"));

      const newItem = {
        id: maxId,
        lastName: toTitleCase(cyrillicToLatin(problem.lastName || '')),
        firstName: toTitleCase(cyrillicToLatin(problem.firstName || '')),
        middleName: toTitleCase(cyrillicToLatin(problem.middleName || '')),
        fullName: `${toTitleCase(cyrillicToLatin(problem.lastName || ''))} ${toTitleCase(cyrillicToLatin(problem.firstName || ''))} ${toTitleCase(cyrillicToLatin(problem.middleName || ''))}`.trim(),
        position: toTitleCase(cyrillicToLatin(problem.position || 'Xodim')),
        objectName: toTitleCase(cyrillicToLatin(problem.objectName || 'Bosh ofis')),
        phone: phoneObj.phone,
        rawPhone: phoneObj.rawPhone,
        pcSpecs,
        deviceType,
        monitor1,
        monitor2,
        monitorCount: (monitor1 ? 1 : 0) + (monitor2 ? 1 : 0),
        printer,
        createdAt: new Date().toISOString(),
      };

      items.unshift(newItem);
      updatedOrCreatedItem = newItem;
    }

    fs.writeFileSync(INVENTORY_FILE_BACKEND, JSON.stringify(items, null, 2), 'utf-8');
    if (fs.existsSync(path.dirname(INVENTORY_FILE_FRONTEND))) {
      try {
        fs.writeFileSync(INVENTORY_FILE_FRONTEND, JSON.stringify(items, null, 2), 'utf-8');
      } catch (err) {
        // ignore
      }
    }

    return updatedOrCreatedItem;
  } catch (err) {
    console.error('Error syncing resolved equipment to inventory:', err);
    return null;
  }
}

// ─────────────────────────────────────────────
// PATCH /api/problems/:id/resolve  –  Hal qilindi deb belgilash
// ─────────────────────────────────────────────
async function resolveProblem(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid problem ID' });
    }

    const existing = await prisma.problem.findUnique({ where: { id } });

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Problem not found' });
    }

    if (existing.status === 'RESOLVED') {
      return res.status(400).json({ success: false, message: 'Problem is already resolved' });
    }

    const { resolveNote } = req.body;

    const problem = await prisma.problem.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
        resolveNote: resolveNote ? resolveNote.trim() : null,
      },
    });

    // Agar murojaat turi "Jihoz so'rovi" bo'lsa, xodim va jihozni avtomatik Inventarga sinxronlashtirish
    let inventoryItem = null;
    let inventorySynced = false;

    if (problem.type === "Jihoz so'rovi") {
      inventoryItem = syncResolvedEquipmentToInventory(problem);
      if (inventoryItem) {
        inventorySynced = true;
      }
    }

    return res.json({ 
      success: true, 
      problem,
      inventorySynced,
      inventoryItem
    });
  } catch (error) {
    next(error);
  }
}

// ─────────────────────────────────────────────
// DELETE /api/problems/:id  –  Muammo o'chirish
// ─────────────────────────────────────────────
async function deleteProblem(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid problem ID' });
    }

    const existing = await prisma.problem.findUnique({ where: { id } });

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Problem not found' });
    }

    await prisma.problem.delete({ where: { id } });

    return res.json({ success: true, message: 'Problem deleted successfully' });
  } catch (error) {
    next(error);
  }
}

// ─────────────────────────────────────────────
// GET /api/problems/export  –  Excel faylini yuklab olish
// Query: ?type=  (ixtiyoriy — filtrlash uchun)
// ─────────────────────────────────────────────
async function exportProblems(req, res, next) {
  try {
    const { type } = req.query;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'IT Support System';
    workbook.created = new Date();

    // ── Stil konstantalar ───────────────────────
    const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
    const headerFont = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };
    const headerAlignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    const borderThin = { style: 'thin', color: { argb: 'FFE2E8F0' } };
    const cellBorder = { top: borderThin, left: borderThin, bottom: borderThin, right: borderThin };

    const formatDate = (d) => {
      if (!d) return '—';
      const dt = new Date(d);
      const pad = (n) => String(n).padStart(2, '0');
      return `${pad(dt.getDate())}.${pad(dt.getMonth() + 1)}.${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
    };

    // ── Qaysi turlarni eksport qilish ──────────
    const typesToExport = type ? [type] : ["Texnik muammo", "Jihoz so'rovi"];

    for (const currentType of typesToExport) {
      const isTM = currentType === "Texnik muammo";
      const sheetName = isTM ? 'Texnik muammo' : "Jihoz so'rovi";

      const problems = await prisma.problem.findMany({
        where: { type: currentType },
        orderBy: { createdAt: 'desc' },
      });

      const sheet = workbook.addWorksheet(sheetName, {
        pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
        views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }],
      });

      // ── Ustunlar ─────────────────────────────
      if (isTM) {
        sheet.columns = [
          { header: 'Sana',           key: 'sana',        width: 18 },
          { header: 'Ticket',         key: 'ticket',      width: 12 },
          { header: 'Familiya',       key: 'lastName',    width: 16 },
          { header: 'Ism',            key: 'firstName',   width: 14 },
          { header: 'Sharif',         key: 'middleName',  width: 18 },
          { header: 'Lavozimi',       key: 'position',    width: 22 },
          { header: 'Obyekt nomi',    key: 'objectName',  width: 24 },
          { header: 'Telefon',        key: 'phone',       width: 16 },
          { header: 'Xona',           key: 'room',        width: 10 },
          { header: 'Kompyuter',      key: 'computer',    width: 14 },
          { header: 'Muammo tavsifi', key: 'description', width: 38 },
          { header: 'Status',         key: 'status',      width: 14 },
          { header: 'Hal qilingan sana', key: 'resolvedAt', width: 18 },
        ];

        problems.forEach((p) => {
          sheet.addRow({
            sana:        formatDate(p.createdAt),
            ticket:      p.ticketNumber,
            lastName:    p.lastName,
            firstName:   p.firstName,
            middleName:  p.middleName,
            position:    p.position,
            objectName:  p.objectName,
            phone:       p.phone,
            room:        p.room        || '—',
            computer:    p.computer    || '—',
            description: p.description || '—',
            status:      p.status === 'NEW' ? 'Yangi' : 'Hal qilindi',
            resolvedAt:  formatDate(p.resolvedAt),
          });
        });
      } else {
        sheet.columns = [
          { header: 'Sana',              key: 'sana',          width: 18 },
          { header: 'Ticket',            key: 'ticket',        width: 12 },
          { header: 'Familiya',          key: 'lastName',      width: 16 },
          { header: 'Ism',               key: 'firstName',     width: 14 },
          { header: 'Sharif',            key: 'middleName',    width: 18 },
          { header: 'Lavozimi',          key: 'position',      width: 22 },
          { header: 'Obyekt nomi',       key: 'objectName',    width: 24 },
          { header: 'Telefon',           key: 'phone',         width: 16 },
          { header: "So'ralgan jihoz",   key: 'requestedItem', width: 28 },
          { header: 'Miqdor',            key: 'quantity',      width: 10 },
          { header: 'Izoh',              key: 'description',   width: 32 },
          { header: 'Status',            key: 'status',        width: 14 },
          { header: 'Hal qilingan sana', key: 'resolvedAt',    width: 18 },
        ];

        problems.forEach((p) => {
          sheet.addRow({
            sana:          formatDate(p.createdAt),
            ticket:        p.ticketNumber,
            lastName:      p.lastName,
            firstName:     p.firstName,
            middleName:    p.middleName,
            position:      p.position,
            objectName:    p.objectName,
            phone:         p.phone,
            requestedItem: p.requestedItem || '—',
            quantity:      p.quantity ?? 1,
            description:   p.description  || '—',
            status:        p.status === 'NEW' ? 'Yangi' : 'Hal qilindi',
            resolvedAt:    formatDate(p.resolvedAt),
          });
        });
      }

      // ── Header satrini stil berish ────────────
      const headerRow = sheet.getRow(1);
      headerRow.height = 32;
      headerRow.eachCell((cell) => {
        cell.fill      = headerFill;
        cell.font      = headerFont;
        cell.alignment = headerAlignment;
        cell.border    = cellBorder;
      });

      // ── Ma'lumot satrlarini stil berish ────────
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        row.height = 22;
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.alignment = { vertical: 'middle', wrapText: true };
          cell.border    = cellBorder;
          // Status rangi
          if (cell.value === 'Hal qilindi') {
            cell.font = { color: { argb: 'FF16A34A' }, bold: true };
          } else if (cell.value === 'Yangi') {
            cell.font = { color: { argb: 'FFD97706' }, bold: true };
          }
        });
        // Qator rangi (alternatsiya)
        if (rowNumber % 2 === 0) {
          row.eachCell({ includeEmpty: true }, (cell) => {
            if (!cell.fill || cell.fill.fgColor?.argb !== 'FF1D4ED8') {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
            }
          });
        }
      });
    }

    // ── Fayl nomi ──────────────────────────────
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const typeStr = type
      ? (type === "Texnik muammo" ? '_TM' : '_JS')
      : '_hammasi';
    const filename = `murojaatlar${typeStr}_${dateStr}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
}

// ─────────────────────────────────────────────
// GET /api/stats  –  Yig'ilgan statistika
// Query params: ?year=2026  (default: joriy yil)
// ─────────────────────────────────────────────
async function getStats(req, res, next) {
  try {
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();

    const yearStart = new Date(`${year}-01-01T00:00:00.000Z`);
    const yearEnd   = new Date(`${year + 1}-01-01T00:00:00.000Z`);

    const all = await prisma.problem.findMany({
      where: { createdAt: { gte: yearStart, lt: yearEnd } },
      select: {
        room: true, computer: true, status: true,
        createdAt: true, resolvedAt: true,
        type: true, requestedItem: true,
      },
    });

    const MONTH_NAMES = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];

    // ── Oylik statistika ────────────────────────
    const monthlyMap = {};
    for (let m = 0; m < 12; m++) {
      monthlyMap[m] = { month: MONTH_NAMES[m], total: 0, resolved: 0, new: 0, technical: 0, requests: 0 };
    }
    all.forEach((p) => {
      const m = new Date(p.createdAt).getUTCMonth();
      monthlyMap[m].total++;
      if (p.status === 'RESOLVED') monthlyMap[m].resolved++;
      else monthlyMap[m].new++;
      if (p.type === "Texnik muammo") monthlyMap[m].technical++;
      else monthlyMap[m].requests++;
    });
    const monthly = Object.values(monthlyMap);

    // ── Eng ko'p muammo bo'lgan xonalar (top 10) ─
    const roomMap = {};
    all.forEach((p) => {
      if (p.room) roomMap[p.room] = (roomMap[p.room] || 0) + 1;
    });
    const topRooms = Object.entries(roomMap)
      .map(([room, count]) => ({ room, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // ── Eng ko'p muammo bo'lgan kompyuterlar (top 10) ─
    const pcMap = {};
    all.forEach((p) => {
      if (p.computer) pcMap[p.computer] = (pcMap[p.computer] || 0) + 1;
    });
    const topComputers = Object.entries(pcMap)
      .map(([computer, count]) => ({ computer, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // ── Umumiy ko'rsatkichlar ──────────────────
    const totalYear      = all.length;
    const resolvedYear   = all.filter((p) => p.status === 'RESOLVED').length;
    const pendingYear    = totalYear - resolvedYear;
    const resolutionRate = totalYear > 0 ? Math.round((resolvedYear / totalYear) * 100) : 0;
    const technicalCount = all.filter((p) => p.type === "Texnik muammo").length;
    const requestsCount  = all.filter((p) => p.type === "Jihoz so'rovi").length;

    // O'rtacha hal qilish vaqti (soat hisobida)
    const resolved = all.filter((p) => p.status === 'RESOLVED' && p.resolvedAt);
    let avgResolutionHours = null;
    if (resolved.length > 0) {
      const totalMs = resolved.reduce((sum, p) => {
        return sum + (new Date(p.resolvedAt) - new Date(p.createdAt));
      }, 0);
      avgResolutionHours = Math.round((totalMs / resolved.length / 1000 / 60 / 60) * 10) / 10;
    }

    return res.json({
      success: true,
      year,
      summary: {
        totalYear, resolvedYear, pendingYear,
        resolutionRate, avgResolutionHours,
        technicalCount, requestsCount,
      },
      monthly,
      topRooms,
      topComputers,
    });
  } catch (error) {
    next(error);
  }
}

// ─────────────────────────────────────────────
// PUT /api/problems/:id  –  Murojaatni tahrirlash (Faqat IT Support)
// ─────────────────────────────────────────────
async function updateProblem(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid problem ID' });
    }

    const existing = await prisma.problem.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Problem not found' });
    }

    const {
      type,
      lastName, firstName, middleName,
      position, objectName, phone,
      room, computer, description,
      requestedItem, quantity,
      status
    } = req.body;

    // Tur validatsiyasi
    if (type && !VALID_TYPES.includes(type)) {
      return res.status(400).json({
        success: false,
        message: `Murojaat turi noto'g'ri. "${VALID_TYPES.join('" yoki "')}" bo'lishi kerak.`,
      });
    }

    // Status validatsiyasi
    const VALID_STATUSES = ['NEW', 'RESOLVED'];
    if (status && !VALID_STATUSES.includes(status.toUpperCase())) {
      return res.status(400).json({
        success: false,
        message: `Status noto'g'ri. "NEW" yoki "RESOLVED" bo'lishi kerak.`,
      });
    }

    // Update payload
    const updateData = {};
    if (type) updateData.type = type;
    if (lastName !== undefined) updateData.lastName = lastName.toString().trim();
    if (firstName !== undefined) updateData.firstName = firstName.toString().trim();
    if (middleName !== undefined) updateData.middleName = middleName.toString().trim();
    if (position !== undefined) updateData.position = position.toString().trim();
    if (objectName !== undefined) updateData.objectName = objectName.toString().trim();
    if (phone !== undefined) updateData.phone = phone.toString().trim();

    if (room !== undefined) updateData.room = room ? room.toString().trim() : null;
    if (computer !== undefined) updateData.computer = computer ? computer.toString().trim() : null;
    if (description !== undefined) updateData.description = description ? description.toString().trim() : null;
    if (requestedItem !== undefined) updateData.requestedItem = requestedItem ? requestedItem.toString().trim() : null;
    if (quantity !== undefined) updateData.quantity = quantity ? parseInt(quantity, 10) : null;

    if (status) {
      const newStatus = status.toUpperCase();
      updateData.status = newStatus;
      if (newStatus === 'RESOLVED' && existing.status !== 'RESOLVED') {
        updateData.resolvedAt = new Date();
      } else if (newStatus === 'NEW' && existing.status === 'RESOLVED') {
        updateData.resolvedAt = null;
      }
    }

    const updated = await prisma.problem.update({
      where: { id },
      data: updateData,
    });

    return res.json({ success: true, problem: updated });
  } catch (error) {
    next(error);
  }
}

// ─────────────────────────────────────────────
// GET /api/problems/check/:ticket  –  Ticket holati tekshirish (ochiq)
// ─────────────────────────────────────────────
async function checkTicket(req, res, next) {
  try {
    const { ticket } = req.params;
    if (!ticket) return res.status(400).json({ success: false, message: 'Ticket raqami kiritilmagan' });

    const problem = await prisma.problem.findUnique({
      where: { ticketNumber: ticket.toUpperCase() },
      select: {
        ticketNumber: true, type: true, status: true,
        firstName: true, lastName: true,
        room: true, computer: true, description: true,
        requestedItem: true,
        createdAt: true, resolvedAt: true, resolveNote: true,
        assignedUser: { select: { fullName: true } },
      },
    });

    if (!problem) {
      return res.status(404).json({ success: false, message: 'Bunday ticket topilmadi' });
    }

    return res.json({ success: true, problem });
  } catch (error) {
    next(error);
  }
}

// ─────────────────────────────────────────────
// GET /api/problems/new-count  –  Yangi murojaatlar soni (bildirishnoma polling)
// ─────────────────────────────────────────────
async function getNewCount(req, res, next) {
  try {
    // since parametri berilsa — faqat o'sha vaqtdan keyingilarni sanaydi
    const { since } = req.query;
    const where = { status: 'NEW' };
    if (since) {
      const sinceDate = new Date(since);
      if (!isNaN(sinceDate)) where.createdAt = { gt: sinceDate };
    }
    const count = await prisma.problem.count({ where });
    return res.json({ success: true, count });
  } catch (error) {
    next(error);
  }
}

// ─────────────────────────────────────────────
// PATCH /api/problems/:id/assign  –  Murojaatni xodimga biriktirish
// ─────────────────────────────────────────────
async function assignProblem(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ success: false, message: 'Invalid problem ID' });

    const { userId } = req.body;

    // userId null bo'lsa — biriktirishni olib tashlaymiz
    if (userId === null || userId === undefined) {
      const problem = await prisma.problem.update({
        where: { id },
        data: { assignedUserId: null },
        include: { assignedUser: { select: { id: true, fullName: true, phone: true } } },
      });
      return res.json({ success: true, problem });
    }

    const uid = parseInt(userId, 10);
    const worker = await prisma.user.findUnique({ where: { id: uid } });
    if (!worker || worker.role !== 'IT_SUPPORT') {
      return res.status(404).json({ success: false, message: 'IT Support xodimi topilmadi' });
    }

    const problem = await prisma.problem.update({
      where: { id },
      data: { assignedUserId: uid },
      include: { assignedUser: { select: { id: true, fullName: true, phone: true, telegramChatId: true } } },
    });

    // Send Telegram Notification to the worker if telegramChatId is set
    if (worker.telegramChatId) {
      const isTM = problem.type === 'Texnik muammo';
      const text = `📥 <b>SIZGA YANGI MUROJAAT BIRIKTIRILDI</b>\n\n` +
        `📋 <b>Ticket:</b> <code>${problem.ticketNumber}</code> (${problem.type})\n` +
        `👤 <b>Xodim:</b> ${problem.lastName} ${problem.firstName} ${problem.middleName || ''}\n` +
        `🏢 <b>Obyekt:</b> ${problem.objectName || '—'}\n` +
        (isTM ? `🚪 <b>Xona:</b> ${problem.room || '—'} | 🖥️ <b>PC:</b> ${problem.computer || '—'}\n` : `📦 <b>Jihoz:</b> ${problem.requestedItem || '—'} (${problem.quantity || 1} ta)\n`) +
        `📞 <b>Telefon:</b> ${problem.phone || '—'}\n\n` +
        (problem.description ? `📝 <b>Tavsif:</b>\n<i>${problem.description}</i>\n\n` : '') +
        `⏰ <b>Biriktirilgan vaqt:</b> ${new Date().toLocaleString('uz-UZ')}`;

      sendTelegramNotification(worker.telegramChatId, text).catch(() => {});
    }

    return res.json({ success: true, problem });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createProblem,
  getAllProblems,
  getProblemById,
  resolveProblem,
  deleteProblem,
  exportProblems,
  getStats,
  updateProblem,
  checkTicket,
  getNewCount,
  assignProblem,
};

