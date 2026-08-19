const prisma = require('../lib/prisma');
const { sendTelegramNotification } = require('../lib/telegram');

const VALID_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
const VALID_STATUSES   = ['PENDING', 'IN_PROGRESS', 'DONE'];

// ─────────────────────────────────────────────
// GET /api/tasks
// Manager: barcha topshiriqlar
// IT_SUPPORT: faqat o'ziga berilganlar
// ─────────────────────────────────────────────
async function getTasks(req, res, next) {
  try {
    const where = req.user.role === 'IT_SUPPORT'
      ? { assignedTo: req.user.id }
      : {};

    const tasks = await prisma.task.findMany({
      where,
      include: { worker: { select: { id: true, fullName: true, phone: true } } },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });

    return res.json({ success: true, tasks });
  } catch (error) {
    next(error);
  }
}

// ─────────────────────────────────────────────
// POST /api/tasks  — Topshiriq yaratish (Manager)
// ─────────────────────────────────────────────
async function createTask(req, res, next) {
  try {
    if (req.user.role !== 'MANAGER') {
      return res.status(403).json({ success: false, message: "Faqat Manager topshiriq yarata oladi" });
    }

    const { title, description, priority, deadline, assignedTo } = req.body;

    if (!title?.trim())       return res.status(400).json({ success: false, message: 'Sarlavha kiritilmagan' });
    if (!description?.trim()) return res.status(400).json({ success: false, message: 'Tavsif kiritilmagan' });
    if (!assignedTo)          return res.status(400).json({ success: false, message: 'Xodim tanlanmagan' });

    const selectedPriority = priority?.toUpperCase() || 'NORMAL';
    if (!VALID_PRIORITIES.includes(selectedPriority)) {
      return res.status(400).json({ success: false, message: "Muhimlik darajasi noto'g'ri" });
    }

    // Xodim mavjudligini tekshirish
    const worker = await prisma.user.findUnique({
      where: { id: parseInt(assignedTo, 10) },
    });
    if (!worker || worker.role !== 'IT_SUPPORT') {
      return res.status(404).json({ success: false, message: "IT Support xodimi topilmadi" });
    }

    const task = await prisma.task.create({
      data: {
        title: title.trim(),
        description: description.trim(),
        priority: selectedPriority,
        deadline: deadline ? new Date(deadline) : null,
        assignedTo: parseInt(assignedTo, 10),
      },
      include: { worker: { select: { id: true, fullName: true, phone: true, telegramChatId: true } } },
    });

    // Send Telegram Notification to the worker if telegramChatId is set
    if (worker.telegramChatId) {
      const priorityIcons = {
        URGENT: '🔴 Shoshilinch',
        HIGH:   '🟡 Yuqori',
        NORMAL: '🔵 Normal',
        LOW:    '🟢 Past',
      };
      const dlStr = task.deadline ? new Date(task.deadline).toLocaleDateString('uz-UZ') : 'Belgilanmagan';
      const text = `📋 <b>SIZGA YANGI TOPSHIRIQ YUKLANDI</b>\n\n` +
        `📌 <b>Sarlavha:</b> ${task.title}\n` +
        `⚡ <b>Muhimlik darajasi:</b> ${priorityIcons[task.priority] || task.priority}\n` +
        `📅 <b>Muddat (Deadline):</b> ${dlStr}\n\n` +
        `📝 <b>Topshiriq tavsifi:</b>\n<i>${task.description}</i>\n\n` +
        `👔 <b>Topshiruvchi:</b> ${req.user.fullName} (Manager)\n` +
        `⏰ <b>Vaqti:</b> ${new Date().toLocaleString('uz-UZ')}`;

      sendTelegramNotification(worker.telegramChatId, text).catch(() => {});
    }

    return res.status(201).json({ success: true, task });
  } catch (error) {
    next(error);
  }
}

// ─────────────────────────────────────────────
// PATCH /api/tasks/:id/status — Status yangilash (IT Support)
// ─────────────────────────────────────────────
async function updateTaskStatus(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ success: false, message: 'Invalid task ID' });

    const { status } = req.body;
    const newStatus = status?.toUpperCase();

    if (!newStatus || !VALID_STATUSES.includes(newStatus)) {
      return res.status(400).json({ success: false, message: "Status noto'g'ri. PENDING | IN_PROGRESS | DONE bo'lishi kerak" });
    }

    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) return res.status(404).json({ success: false, message: 'Topshiriq topilmadi' });

    // IT Support faqat o'ziga berilgan topshiriqni yangilay oladi
    if (req.user.role === 'IT_SUPPORT' && task.assignedTo !== req.user.id) {
      return res.status(403).json({ success: false, message: "Bu topshiriq sizga biriktirilmagan" });
    }

    const updated = await prisma.task.update({
      where: { id },
      data: {
        status: newStatus,
        completedAt: newStatus === 'DONE' ? new Date() : null,
      },
      include: { worker: { select: { id: true, fullName: true, phone: true } } },
    });

    return res.json({ success: true, task: updated });
  } catch (error) {
    next(error);
  }
}

// ─────────────────────────────────────────────
// DELETE /api/tasks/:id  — O'chirish (Manager)
// ─────────────────────────────────────────────
async function deleteTask(req, res, next) {
  try {
    if (req.user.role !== 'MANAGER') {
      return res.status(403).json({ success: false, message: "Faqat Manager topshiriq o'chira oladi" });
    }

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ success: false, message: 'Invalid task ID' });

    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) return res.status(404).json({ success: false, message: 'Topshiriq topilmadi' });

    await prisma.task.delete({ where: { id } });
    return res.json({ success: true, message: "Topshiriq o'chirildi" });
  } catch (error) {
    next(error);
  }
}

// ─────────────────────────────────────────────
// GET /api/users?role=IT_SUPPORT  — Xodimlar ro'yxati (Manager)
// ─────────────────────────────────────────────
async function getUsers(req, res, next) {
  try {
    const { role } = req.query;
    const where = role ? { role: role.toUpperCase() } : {};

    const users = await prisma.user.findMany({
      where,
      select: { id: true, fullName: true, phone: true, role: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    return res.json({ success: true, users });
  } catch (error) {
    next(error);
  }
}

// ─────────────────────────────────────────────
// DELETE /api/users/:id — Xodim hisobini o'chirish (Manager)
// ─────────────────────────────────────────────
async function deleteUser(req, res, next) {
  try {
    if (req.user.role !== 'MANAGER') {
      return res.status(403).json({ success: false, message: "Faqat Manager xodimlarni o'chira oladi" });
    }

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ success: false, message: 'Invalid user ID' });

    if (req.user.id === id) {
      return res.status(400).json({ success: false, message: "Manager o'z hisobini o'chira olmaydi" });
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ success: false, message: 'Foydalanuvchi topilmadi' });

    await prisma.user.delete({ where: { id } });
    return res.json({ success: true, message: "Xodim hisobi muvaffaqiyatli o'chirildi" });
  } catch (error) {
    next(error);
  }
}

module.exports = { getTasks, createTask, updateTaskStatus, deleteTask, getUsers, deleteUser };
