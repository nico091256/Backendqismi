const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const DATA_FILE = path.join(__dirname, '../data/inventoryData.json');

function readData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error reading inventoryData.json:', err);
  }
  return [];
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving inventoryData.json:', err);
  }
}

// GET /api/inventory
async function getAllInventory(req, res) {
  try {
    let items = readData();
    const { search, position, deviceType } = req.query;

    if (search) {
      const s = search.toLowerCase().trim();
      items = items.filter(it => 
        (it.fullName && it.fullName.toLowerCase().includes(s)) ||
        (it.position && it.position.toLowerCase().includes(s)) ||
        (it.phone && it.phone.includes(s)) ||
        (it.pcSpecs && it.pcSpecs.toLowerCase().includes(s)) ||
        (it.monitor1 && it.monitor1.toLowerCase().includes(s)) ||
        (it.monitor2 && it.monitor2.toLowerCase().includes(s)) ||
        (it.printer && it.printer.toLowerCase().includes(s))
      );
    }

    if (position && position !== 'ALL') {
      items = items.filter(it => it.position === position);
    }

    if (deviceType && deviceType !== 'ALL') {
      if (deviceType === 'DUAL_MONITOR') {
        items = items.filter(it => it.monitorCount >= 2);
      } else if (deviceType === 'HAS_PRINTER') {
        items = items.filter(it => it.printer && it.printer.trim().length > 0);
      } else {
        items = items.filter(it => it.deviceType === deviceType);
      }
    }

    items.sort((a, b) => {
      const nameA = `${a.lastName || ''} ${a.firstName || ''}`.trim().toLowerCase();
      const nameB = `${b.lastName || ''} ${b.firstName || ''}`.trim().toLowerCase();
      return nameA.localeCompare(nameB, 'uz', { sensitivity: 'base' });
    });

    res.json({
      success: true,
      total: items.length,
      items
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// GET /api/inventory/stats
async function getInventoryStats(req, res) {
  try {
    const items = readData();
    const total = items.length;
    const pcCount = items.filter(it => it.deviceType === 'PC').length;
    const laptopCount = items.filter(it => it.deviceType === 'Laptop').length;
    const dualMonitorCount = items.filter(it => it.monitorCount >= 2).length;
    const singleMonitorCount = items.filter(it => it.monitorCount === 1).length;
    const printerCount = items.filter(it => it.printer && it.printer.trim().length > 0).length;

    const departmentCounts = {};
    items.forEach(it => {
      const pos = it.position || "Boshqa";
      departmentCounts[pos] = (departmentCounts[pos] || 0) + 1;
    });

    res.json({
      success: true,
      stats: {
        total,
        pcCount,
        laptopCount,
        dualMonitorCount,
        singleMonitorCount,
        printerCount,
        departmentCounts
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// POST /api/inventory
async function createInventoryItem(req, res) {
  try {
    const { lastName, firstName, middleName, position, phone, pcSpecs, monitor1, monitor2, printer } = req.body;
    if (!lastName || !firstName) {
      return res.status(400).json({ success: false, message: "Familiya va ism majburiy!" });
    }

    const items = readData();
    const newId = items.length > 0 ? Math.max(...items.map(i => i.id || 0)) + 1 : 1;
    
    const isLaptop = /laptop|noutbuk|vivobook|aspire/i.test(pcSpecs || '');
    const deviceType = isLaptop ? 'Laptop' : (pcSpecs ? 'PC' : 'Noma\'lum');

    const newItem = {
      id: newId,
      lastName: lastName.trim(),
      firstName: firstName.trim(),
      middleName: (middleName || '').trim(),
      fullName: `${lastName} ${firstName} ${middleName || ''}`.trim(),
      position: (position || 'Xodim').trim(),
      phone: (phone || '').trim(),
      rawPhone: (phone || '').replace(/\D/g, ''),
      pcSpecs: (pcSpecs || '').trim(),
      deviceType,
      monitor1: (monitor1 || '').trim(),
      monitor2: (monitor2 || '').trim(),
      monitorCount: (monitor1 ? 1 : 0) + (monitor2 ? 1 : 0),
      printer: (printer || '').trim(),
      createdAt: new Date().toISOString()
    };

    items.unshift(newItem);
    saveData(items);

    res.status(201).json({ success: true, item: newItem });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// PATCH /api/inventory/:id
async function updateInventoryItem(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const items = readData();
    const idx = items.findIndex(it => it.id === id);

    if (idx === -1) {
      return res.status(404).json({ success: false, message: "Jihoz/Xodim topilmadi" });
    }

    const current = items[idx];
    const update = req.body;

    const lastName = update.lastName !== undefined ? update.lastName.trim() : current.lastName;
    const firstName = update.firstName !== undefined ? update.firstName.trim() : current.firstName;
    const middleName = update.middleName !== undefined ? update.middleName.trim() : current.middleName;
    const pcSpecs = update.pcSpecs !== undefined ? update.pcSpecs.trim() : current.pcSpecs;
    const monitor1 = update.monitor1 !== undefined ? update.monitor1.trim() : current.monitor1;
    const monitor2 = update.monitor2 !== undefined ? update.monitor2.trim() : current.monitor2;

    const isLaptop = /laptop|noutbuk|vivobook|aspire/i.test(pcSpecs || '');
    const deviceType = isLaptop ? 'Laptop' : (pcSpecs ? 'PC' : 'Noma\'lum');

    items[idx] = {
      ...current,
      ...update,
      lastName,
      firstName,
      middleName,
      fullName: `${lastName} ${firstName} ${middleName}`.trim(),
      position: update.position !== undefined ? update.position.trim() : current.position,
      phone: update.phone !== undefined ? update.phone.trim() : current.phone,
      pcSpecs,
      deviceType,
      monitor1,
      monitor2,
      monitorCount: (monitor1 ? 1 : 0) + (monitor2 ? 1 : 0),
      printer: update.printer !== undefined ? update.printer.trim() : current.printer,
      updatedAt: new Date().toISOString()
    };

    saveData(items);
    res.json({ success: true, item: items[idx] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// DELETE /api/inventory/:id
async function deleteInventoryItem(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    let items = readData();
    const exists = items.some(it => it.id === id);

    if (!exists) {
      return res.status(404).json({ success: false, message: "Jihoz/Xodim topilmadi" });
    }

    items = items.filter(it => it.id !== id);
    saveData(items);

    res.json({ success: true, message: "Muvaffaqiyatli o'chirildi" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// GET /api/inventory/export
async function exportInventoryExcel(req, res) {
  try {
    const items = readData();
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Inventarizatsiya');

    worksheet.columns = [
      { header: '№', key: 'id', width: 6 },
      { header: 'Familiya', key: 'lastName', width: 18 },
      { header: 'Ism', key: 'firstName', width: 16 },
      { header: 'Otasining ismi', key: 'middleName', width: 22 },
      { header: 'Lavozimi / Bo\'limi', key: 'position', width: 25 },
      { header: 'Telefon raqam', key: 'phone', width: 18 },
      { header: 'PC / Laptop Xarakteristikasi', key: 'pcSpecs', width: 45 },
      { header: '1-Monitor', key: 'monitor1', width: 16 },
      { header: '2-Monitor', key: 'monitor2', width: 16 },
      { header: 'Printer / Qurilma', key: 'printer', width: 20 },
    ];

    // Style header row
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E293B' },
    };
    worksheet.getRow(1).height = 28;

    items.forEach((it, index) => {
      const row = worksheet.addRow({
        id: index + 1,
        lastName: it.lastName,
        firstName: it.firstName,
        middleName: it.middleName,
        position: it.position,
        phone: it.phone,
        pcSpecs: it.pcSpecs,
        monitor1: it.monitor1,
        monitor2: it.monitor2,
        printer: it.printer,
      });

      if (index % 2 === 1) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8FAFC' },
        };
      }
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="DI_Inventarizatsiya_Hisobot.xlsx"'
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = {
  getAllInventory,
  getInventoryStats,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  exportInventoryExcel
};
