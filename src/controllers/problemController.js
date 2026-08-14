const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// ─────────────────────────────────────────────
// Helper – generate a ticket number like #1001
// ─────────────────────────────────────────────
async function generateTicketNumber() {
  const count = await prisma.problem.count();
  return `#${1001 + count}`;
}

// ─────────────────────────────────────────────
// POST /api/problems  –  Create a new problem
// ─────────────────────────────────────────────
async function createProblem(req, res, next) {
  try {
    const { room, computer, description } = req.body;

    // Validate required fields
    if (!room || !computer || !description) {
      return res.status(400).json({
        success: false,
        message: 'Room, computer and description are required',
      });
    }

    const ticketNumber = await generateTicketNumber();

    const problem = await prisma.problem.create({
      data: {
        ticketNumber,
        room: room.toString().trim(),
        computer: computer.toString().trim(),
        description: description.toString().trim(),
        status: 'NEW',
      },
    });

    return res.status(201).json({ success: true, problem });
  } catch (error) {
    next(error);
  }
}

// ─────────────────────────────────────────────
// GET /api/problems  –  Return all problems (newest first)
// ─────────────────────────────────────────────
async function getAllProblems(req, res, next) {
  try {
    const problems = await prisma.problem.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ success: true, problems });
  } catch (error) {
    next(error);
  }
}

// ─────────────────────────────────────────────
// GET /api/problems/:id  –  Return a single problem
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

// ─────────────────────────────────────────────
// PATCH /api/problems/:id/resolve  –  Mark as resolved
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

    const problem = await prisma.problem.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
      },
    });

    return res.json({ success: true, problem });
  } catch (error) {
    next(error);
  }
}

// ─────────────────────────────────────────────
// DELETE /api/problems/:id  –  Permanently delete
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
// GET /api/stats  –  Aggregated statistics
// Query params: ?year=2026  (default: current year)
// ─────────────────────────────────────────────
async function getStats(req, res, next) {
  try {
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();

    const yearStart = new Date(`${year}-01-01T00:00:00.000Z`);
    const yearEnd   = new Date(`${year + 1}-01-01T00:00:00.000Z`);

    // All problems in the requested year
    const all = await prisma.problem.findMany({
      where: { createdAt: { gte: yearStart, lt: yearEnd } },
      select: { room: true, computer: true, status: true, createdAt: true, resolvedAt: true },
    });

    const MONTH_NAMES = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];

    // ── Monthly breakdown ──────────────────────
    const monthlyMap = {};
    for (let m = 0; m < 12; m++) {
      monthlyMap[m] = { month: MONTH_NAMES[m], total: 0, resolved: 0, new: 0 };
    }
    all.forEach((p) => {
      const m = new Date(p.createdAt).getUTCMonth();
      monthlyMap[m].total++;
      if (p.status === 'RESOLVED') monthlyMap[m].resolved++;
      else monthlyMap[m].new++;
    });
    const monthly = Object.values(monthlyMap);

    // ── Top rooms (top 10) ─────────────────────
    const roomMap = {};
    all.forEach((p) => {
      roomMap[p.room] = (roomMap[p.room] || 0) + 1;
    });
    const topRooms = Object.entries(roomMap)
      .map(([room, count]) => ({ room, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // ── Top computers (top 10) ─────────────────
    const pcMap = {};
    all.forEach((p) => {
      pcMap[p.computer] = (pcMap[p.computer] || 0) + 1;
    });
    const topComputers = Object.entries(pcMap)
      .map(([computer, count]) => ({ computer, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // ── Summary ───────────────────────────────
    const totalYear     = all.length;
    const resolvedYear  = all.filter((p) => p.status === 'RESOLVED').length;
    const pendingYear   = totalYear - resolvedYear;
    const resolutionRate = totalYear > 0 ? Math.round((resolvedYear / totalYear) * 100) : 0;

    // Average resolution time in hours (only resolved problems with resolvedAt)
    const resolved = all.filter((p) => p.status === 'RESOLVED' && p.resolvedAt);
    let avgResolutionHours = null;
    if (resolved.length > 0) {
      const totalMs = resolved.reduce((sum, p) => {
        return sum + (new Date(p.resolvedAt) - new Date(p.createdAt));
      }, 0);
      avgResolutionHours = Math.round(totalMs / resolved.length / 1000 / 60 / 60 * 10) / 10;
    }

    return res.json({
      success: true,
      year,
      summary: { totalYear, resolvedYear, pendingYear, resolutionRate, avgResolutionHours },
      monthly,
      topRooms,
      topComputers,
    });
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
  getStats,
};
