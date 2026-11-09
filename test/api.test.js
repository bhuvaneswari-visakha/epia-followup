const test = require('node:test');
const assert = require('node:assert/strict');
delete process.env.ANTHROPIC_API_KEY; // tests always run in mock AI mode
const { openDb } = require('../src/db');
const { createApp } = require('../src/app');
const { todayStr } = require('../src/validation');

let server, base;
const shift = (n) => { const d = new Date(); d.setDate(d.getDate() + n); const p = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

test.before(async () => {
  server = createApp(openDb(':memory:')).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

const call = async (method, path, body) => {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
};
const patient = (over = {}) => ({ name: 'Test Patient', phone: '+919111111111', consultationDate: shift(-7), followUpDate: todayStr(), ...over });

test('POST /api/patients creates a patient', async () => {
  const r = await call('POST', '/api/patients', patient());
  assert.equal(r.status, 201);
  assert.equal(r.body.followUpStatus, 'pending');
  assert.ok(r.body.id);
});

test('POST /api/patients validates input', async () => {
  const cases = [
    patient({ name: '' }), patient({ phone: 'abc' }), patient({ consultationDate: '2026-13-40' }),
    patient({ followUpDate: shift(-30) }), {},
  ];
  for (const c of cases) {
    const r = await call('POST', '/api/patients', c);
    assert.equal(r.status, 400, JSON.stringify(c));
    assert.ok(Array.isArray(r.body.details));
  }
});

test('malformed JSON returns 400', async () => {
  const res = await fetch(base + '/api/patients', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' });
  assert.equal(res.status, 400);
});

test('GET /api/patients lists all', async () => {
  const r = await call('GET', '/api/patients');
  assert.equal(r.status, 200);
  assert.ok(r.body.length >= 1);
});

test('GET /api/patients/due-today returns only today (pending) and supports overdue flag', async () => {
  await call('POST', '/api/patients', patient({ name: 'Overdue One', followUpDate: shift(-2) }));
  await call('POST', '/api/patients', patient({ name: 'Future One', followUpDate: shift(4) }));
  const today = await call('GET', '/api/patients/due-today');
  assert.ok(today.body.patients.every((p) => p.followUpDate === todayStr()));
  assert.ok(!today.body.patients.some((p) => p.name === 'Overdue One'));
  const withOverdue = await call('GET', '/api/patients/due-today?includeOverdue=true');
  assert.ok(withOverdue.body.patients.some((p) => p.name === 'Overdue One'));
  assert.ok(!withOverdue.body.patients.some((p) => p.name === 'Future One'));
  assert.equal((await call('GET', '/api/patients/due-today?date=nope')).status, 400);
});

test('PATCH follow-up -> completed, then 409 on repeat, 404 unknown, 400 bad status', async () => {
  const { body: p } = await call('POST', '/api/patients', patient({ name: 'Complete Me' }));
  const ok = await call('PATCH', `/api/patients/${p.id}/follow-up`, { status: 'completed' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.followUpStatus, 'completed');
  assert.ok(ok.body.completedAt);
  assert.equal((await call('PATCH', `/api/patients/${p.id}/follow-up`, { status: 'completed' })).status, 409);
  assert.equal((await call('PATCH', '/api/patients/99999/follow-up', { status: 'completed' })).status, 404);
  assert.equal((await call('PATCH', `/api/patients/${p.id}/follow-up`, { status: 'weird' })).status, 400);
  const due = await call('GET', '/api/patients/due-today');
  assert.ok(!due.body.patients.some((x) => x.id === p.id), 'completed patients are no longer due');
});

test('GET /api/patients/:id 404 and 400', async () => {
  assert.equal((await call('GET', '/api/patients/99999')).status, 404);
  assert.equal((await call('GET', '/api/patients/abc')).status, 400);
});

test('AI workflow: generate -> pending_review -> edit -> approve; nothing auto-sent', async () => {
  const gen = await call('POST', '/api/followups/generate', {});
  assert.equal(gen.status, 201);
  assert.ok(gen.body.created.length >= 1);
  const d = gen.body.created[0];
  assert.equal(d.status, 'pending_review');
  assert.equal(d.source, 'mock');
  assert.equal(d.whatsappLink, null, 'no send link before approval');

  const again = await call('POST', '/api/followups/generate', {});
  assert.equal(again.body.created.length, 0, 'no duplicate drafts');

  const edited = await call('PATCH', `/api/drafts/${d.id}`, { message: 'Hello, edited by staff before approval.' });
  assert.equal(edited.status, 200);
  const approved = await call('POST', `/api/drafts/${d.id}/approve`, { reviewer: 'Nurse Anita' });
  assert.equal(approved.body.status, 'approved');
  assert.equal(approved.body.reviewedBy, 'Nurse Anita');
  assert.match(approved.body.whatsappLink, /^https:\/\/wa\.me\/\d+\?text=/);
  assert.equal((await call('POST', `/api/drafts/${d.id}/reject`, {})).status, 409);
  assert.equal((await call('PATCH', `/api/drafts/${d.id}`, { message: 'too late to edit this' })).status, 409);
});

test('unknown API route -> 404 JSON', async () => {
  assert.equal((await call('GET', '/api/nope')).status, 404);
});
