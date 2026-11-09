class ValidationError extends Error {
  constructor(details) { super('Validation failed'); this.details = details; this.status = 400; }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// Accepts +919876543210, 919876543210, 9876543210, with spaces/dashes/brackets.
function normalizePhone(raw) {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/[\s\-()]/g, '');
  if (!/^\+?\d{10,15}$/.test(cleaned)) return null;
  return cleaned;
}

function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; // server-local date
}

function validatePatientInput(body) {
  const errors = [];
  const b = body && typeof body === 'object' ? body : {};
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (name.length < 2 || name.length > 100) errors.push('name must be a string of 2-100 characters');

  const phone = normalizePhone(b.phone);
  if (!phone) errors.push('phone must contain 10-15 digits (optional leading +)');

  if (!isRealDate(b.consultationDate)) errors.push('consultationDate must be a valid date in YYYY-MM-DD format');
  if (!isRealDate(b.followUpDate)) errors.push('followUpDate must be a valid date in YYYY-MM-DD format');
  if (isRealDate(b.consultationDate) && isRealDate(b.followUpDate) && b.followUpDate < b.consultationDate) {
    errors.push('followUpDate cannot be before consultationDate');
  }
  if (errors.length) throw new ValidationError(errors);
  return { name, phone, consultationDate: b.consultationDate, followUpDate: b.followUpDate };
}

function parseId(raw) {
  if (!/^\d+$/.test(String(raw))) throw new ValidationError(['id must be a positive integer']);
  return Number(raw);
}

function parseOptionalDate(raw) {
  if (raw === undefined || raw === '') return todayStr();
  if (!isRealDate(raw)) throw new ValidationError(['date must be a valid date in YYYY-MM-DD format']);
  return raw;
}

module.exports = { ValidationError, validatePatientInput, parseId, parseOptionalDate, todayStr, isRealDate };
