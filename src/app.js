const path = require('path');
const express = require('express');
const { validatePatientInput, parseId, parseOptionalDate, ValidationError, todayStr } = require('./validation');
const { generateDraft } = require('./ai');

const toPatient = (r) => r && ({
  id: r.id, name: r.name, phone: r.phone,
  consultationDate: r.consultation_date, followUpDate: r.follow_up_date,
  followUpStatus: r.follow_up_status, completedAt: r.completed_at, createdAt: r.created_at,
});
const toDraft = (r) => r && ({
  id: r.id, patientId: r.patient_id, patientName: r.name, message: r.message, source: r.source,
  status: r.status, reviewedBy: r.reviewed_by, reviewedAt: r.reviewed_at, createdAt: r.created_at,
  // Convenience for staff: opens WhatsApp with the text pre-filled. Staff must press send themselves.
  whatsappLink: r.status === 'approved' && r.phone
    ? `https://wa.me/${r.phone.replace(/\D/g, '')}?text=${encodeURIComponent(r.message)}` : null,
});

function createApp(db) {
  const app = express();
  app.use(express.json({ limit: '50kb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  const q = {
    insertPatient: db.prepare(`INSERT INTO patients (name, phone, consultation_date, follow_up_date) VALUES (@name,@phone,@consultationDate,@followUpDate)`),
    getPatient: db.prepare(`SELECT * FROM patients WHERE id = ?`),
    allPatients: db.prepare(`SELECT * FROM patients ORDER BY follow_up_date, id`),
    dueExact: db.prepare(`SELECT * FROM patients WHERE follow_up_status='pending' AND follow_up_date = ? ORDER BY id`),
    dueOnOrBefore: db.prepare(`SELECT * FROM patients WHERE follow_up_status='pending' AND follow_up_date <= ? ORDER BY follow_up_date, id`),
    complete: db.prepare(`UPDATE patients SET follow_up_status='completed', completed_at=datetime('now') WHERE id=?`),
    reopen: db.prepare(`UPDATE patients SET follow_up_status='pending', completed_at=NULL WHERE id=?`),
    hasPendingDraft: db.prepare(`SELECT 1 FROM drafts WHERE patient_id=? AND status='pending_review'`),
    insertDraft: db.prepare(`INSERT INTO drafts (patient_id, message, source) VALUES (?,?,?)`),
    draftJoin: db.prepare(`SELECT d.*, p.name, p.phone FROM drafts d JOIN patients p ON p.id=d.patient_id WHERE d.id=?`),
    listDrafts: db.prepare(`SELECT d.*, p.name, p.phone FROM drafts d JOIN patients p ON p.id=d.patient_id ORDER BY d.id DESC`),
    listDraftsByStatus: db.prepare(`SELECT d.*, p.name, p.phone FROM drafts d JOIN patients p ON p.id=d.patient_id WHERE d.status=? ORDER BY d.id DESC`),
    editDraft: db.prepare(`UPDATE drafts SET message=? WHERE id=?`),
    reviewDraft: db.prepare(`UPDATE drafts SET status=?, reviewed_by=?, reviewed_at=datetime('now') WHERE id=?`),
  };

  const notFound = (what) => Object.assign(new Error(`${what} not found`), { status: 404 });
  const conflict = (msg) => Object.assign(new Error(msg), { status: 409 });
  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

  // ---------- Task 1: patients ----------
  app.post('/api/patients', (req, res) => {
    const input = validatePatientInput(req.body);
    const { lastInsertRowid } = q.insertPatient.run(input);
    res.status(201).json(toPatient(q.getPatient.get(lastInsertRowid)));
  });

  app.get('/api/patients', (_req, res) => res.json(q.allPatients.all().map(toPatient)));

  // NOTE: must be registered before /api/patients/:id
  app.get('/api/patients/due-today', (req, res) => {
    const date = parseOptionalDate(req.query.date); // optional override, handy for testing/demo
    const rows = req.query.includeOverdue === 'true' ? q.dueOnOrBefore.all(date) : q.dueExact.all(date);
    res.json({ date, count: rows.length, patients: rows.map(toPatient) });
  });

  app.get('/api/patients/:id', (req, res) => {
    const p = q.getPatient.get(parseId(req.params.id));
    if (!p) throw notFound('Patient');
    res.json(toPatient(p));
  });

  app.patch('/api/patients/:id/follow-up', (req, res) => {
    const id = parseId(req.params.id);
    const status = req.body && req.body.status;
    if (!['completed', 'pending'].includes(status)) throw new ValidationError(['status must be "completed" (or "pending" to reopen)']);
    const p = q.getPatient.get(id);
    if (!p) throw notFound('Patient');
    if (p.follow_up_status === status) throw conflict(`Follow-up is already ${status}`);
    (status === 'completed' ? q.complete : q.reopen).run(id);
    res.json(toPatient(q.getPatient.get(id)));
  });

  // ---------- Task 2: AI follow-up drafts with human approval ----------
  // Step 1: find due patients, generate drafts (status = pending_review). Nothing is sent.
  app.post('/api/followups/generate', wrap(async (req, res) => {
    const date = parseOptionalDate(req.body && req.body.date);
    const due = q.dueOnOrBefore.all(date);
    const created = [], skipped = [];
    for (const p of due) {
      if (q.hasPendingDraft.get(p.id)) { skipped.push({ patientId: p.id, reason: 'draft already awaiting review' }); continue; }
      const { message, source } = await generateDraft(p, date);
      const { lastInsertRowid } = q.insertDraft.run(p.id, message, source);
      created.push(toDraft(q.draftJoin.get(lastInsertRowid)));
    }
    res.status(201).json({
      date, dueCount: due.length, created, skipped,
      note: 'Drafts are pending staff review. No message has been sent.',
    });
  }));

  // Step 2: staff reviews
  app.get('/api/drafts', (req, res) => {
    const { status } = req.query;
    if (status && !['pending_review', 'approved', 'rejected'].includes(status)) throw new ValidationError(['status filter must be pending_review, approved or rejected']);
    res.json((status ? q.listDraftsByStatus.all(status) : q.listDrafts.all()).map(toDraft));
  });

  app.patch('/api/drafts/:id', (req, res) => {
    const id = parseId(req.params.id);
    const d = q.draftJoin.get(id);
    if (!d) throw notFound('Draft');
    if (d.status !== 'pending_review') throw conflict(`Draft is already ${d.status} and can no longer be edited`);
    const msg = req.body && typeof req.body.message === 'string' ? req.body.message.trim() : '';
    if (msg.length < 10 || msg.length > 1000) throw new ValidationError(['message must be 10-1000 characters']);
    q.editDraft.run(msg, id);
    res.json(toDraft(q.draftJoin.get(id)));
  });

  const review = (status) => (req, res) => {
    const id = parseId(req.params.id);
    const d = q.draftJoin.get(id);
    if (!d) throw notFound('Draft');
    if (d.status !== 'pending_review') throw conflict(`Draft is already ${d.status}`);
    const reviewer = req.body && typeof req.body.reviewer === 'string' && req.body.reviewer.trim() ? req.body.reviewer.trim().slice(0, 60) : 'staff';
    q.reviewDraft.run(status, reviewer, id);
    res.json(toDraft(q.draftJoin.get(id)));
  };
  app.post('/api/drafts/:id/approve', review('approved'));
  app.post('/api/drafts/:id/reject', review('rejected'));

  app.get('/api/health', (_req, res) => res.json({ status: 'ok', today: todayStr(), aiMode: process.env.ANTHROPIC_API_KEY ? 'live' : 'mock' }));

  // ---------- errors ----------
  app.use('/api', (_req, _res, next) => next(Object.assign(new Error('Route not found'), { status: 404 })));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
    if (err instanceof ValidationError) return res.status(400).json({ error: err.message, details: err.details });
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}
module.exports = { createApp };
