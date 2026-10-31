/**
 * Topshiriq (Task) muddatlari nazoratchisi.
 * Har 30 daqiqada tekshiradi:
 *  - muddatiga 24 soatdan kam qolgan, tugallanmagan topshiriqlar -> ogohlantirish
 *  - muddati yaqinda (oxirgi 24 soat ichida) o'tib ketganlar      -> muddati o'tdi xabari
 *
 * Takroriy yubormaslik xotirada (Set) saqlanadi — server qayta ishga tushsa,
 * faqat hali ham 24 soatlik oynada turgan topshiriqlar bir marta qayta
 * xabar olishi mumkin (qabul qilinadigan cheklov, DB migratsiyasiz).
 */
const prisma = require('./prisma');
const { notifyTaskDeadlineWarning, notifyTaskDeadlineExpired } = require('./notifications');

const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 daqiqa
const DAY_MS = 24 * 60 * 60 * 1000;

const warnedTaskIds = new Set();
const expiredTaskIds = new Set();

async function checkDeadlines() {
  try {
    const now = new Date();
    const in24h = new Date(now.getTime() + DAY_MS);
    const dayAgo = new Date(now.getTime() - DAY_MS);

    // Muddati [hozirdan -24s ... +24s] oynasida bo'lgan, tugallanmagan topshiriqlar
    const tasks = await prisma.task.findMany({
      where: {
        status: { not: 'DONE' },
        deadline: { gte: dayAgo, lt: in24h },
      },
      include: { worker: { select: { id: true, fullName: true, telegramChatId: true } } },
    });

    for (const task of tasks) {
      const dl = new Date(task.deadline);
      if (dl <= now) {
        if (!expiredTaskIds.has(task.id)) {
          expiredTaskIds.add(task.id);
          await notifyTaskDeadlineExpired(task);
        }
      } else {
        if (!warnedTaskIds.has(task.id)) {
          warnedTaskIds.add(task.id);
          await notifyTaskDeadlineWarning(task);
        }
      }
    }
  } catch (err) {
    console.warn('[Deadline] tekshiruv xatosi:', err.message);
  }
}

function startDeadlineService() {
  checkDeadlines();
  const timer = setInterval(checkDeadlines, CHECK_INTERVAL_MS);
  if (timer.unref) timer.unref();
  console.log('✅  [Deadline] Topshiriq muddati nazoratchisi ishga tushdi (har 30 daqiqada)');
}

module.exports = { startDeadlineService };
