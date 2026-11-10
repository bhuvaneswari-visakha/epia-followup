try { process.loadEnvFile && process.loadEnvFile(); } catch { /* no .env file: fine */ }
const { openDb } = require('./db');
const { createApp } = require('./app');

const port = process.env.PORT || 3000;
const db = openDb(process.env.DB_PATH || './data/followup.db');
if (db.prepare('SELECT COUNT(*) c FROM patients').get().c === 0) require('../scripts/seed.js');
createApp(db).listen(port, () => {
  console.log(`Follow-up API running at http://localhost:${port}`);
  console.log(`AI mode: ${process.env.ANTHROPIC_API_KEY ? 'LIVE (Anthropic API)' : 'MOCK (no API key set)'}`);
});
