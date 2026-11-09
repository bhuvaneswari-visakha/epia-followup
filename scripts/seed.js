// Inserts FICTIONAL patients with dates relative to today so the demo always has due follow-ups.
try { process.loadEnvFile && process.loadEnvFile(); } catch {}
const { openDb } = require('../src/db');

const fmt = (offset) => {
  const d = new Date(); d.setDate(d.getDate() + offset);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const db = openDb(process.env.DB_PATH || './data/followup.db');
const ins = db.prepare('INSERT INTO patients (name, phone, consultation_date, follow_up_date) VALUES (?,?,?,?)');
const rows = [
  ['Asha Verma',   '+919000000001', fmt(-7),  fmt(0)],   // due today
  ['Rohan Mehta',  '+919000000002', fmt(-7),  fmt(0)],   // due today
  ['Priya Nair',   '+919000000003', fmt(-10), fmt(-3)],  // overdue
  ['Karan Singh',  '+919000000004', fmt(-2),  fmt(5)],   // upcoming
  ['Meera Iyer',   '+919000000005', fmt(-14), fmt(-7)],  // overdue
];
db.transaction(() => rows.forEach((r) => ins.run(...r)))();
console.log(`Seeded ${rows.length} fictional patients.`);
