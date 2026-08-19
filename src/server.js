require('dotenv').config();

// ─────────────────────────────────────────────
// Majburiy muhit o'zgaruvchilari tekshiruvi
// ─────────────────────────────────────────────
const REQUIRED_ENV = ['JWT_SECRET', 'MANAGER_SECRET'];
const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error('[FATAL] .env faylida quyidagi o\'zgaruvchilar yo\'q: ' + missing.join(', '));
  console.error('[FATAL] Server ishga tushmaydi. .env faylini tekshiring.');
  process.exit(1);
}

const app = require('./app');

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log('✅  IT Support API running on http://localhost:' + PORT);
  console.log('   Health check: http://localhost:' + PORT + '/api/health');
  console.log('   Environment : ' + (process.env.NODE_ENV || 'development'));
});
