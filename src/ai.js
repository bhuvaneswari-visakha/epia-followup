
const CLINIC = () => process.env.CLINIC_NAME || 'Sunrise Family Clinic';

function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

function context(patient, today) {
  const firstName = patient.name.trim().split(/\s+/)[0];
  const overdueDays = Math.max(0, daysBetween(patient.follow_up_date, today));
  return { firstName, overdueDays, clinic: CLINIC(), consultationDate: patient.consultation_date, followUpDate: patient.follow_up_date };
}

function mockDraft(patient, today) {
  const c = context(patient, today);
  const timing = c.overdueDays === 0
    ? 'Your follow-up visit is due today.'
    : `Your follow-up visit was due ${c.overdueDays} day${c.overdueDays > 1 ? 's' : ''} ago.`;
  return {
    source: 'mock',
    message:
      `Hello ${c.firstName}, this is ${c.clinic}. Thank you for visiting us on ${c.consultationDate}. ` +
      `${timing} How are you feeling since your consultation? ` +
      `Reply here to book a convenient time, or call the clinic if you have any new concerns. ` +
      `Take care!`,
  };
}

async function aiDraft(patient, today) {
  const c = context(patient, today);
  const prompt =
    `Write a short, warm WhatsApp follow-up message (max 60 words, plain text, at most one emoji) ` +
    `from "${c.clinic}" to a patient.\n` +
    `Patient first name: ${c.firstName}\nConsultation date: ${c.consultationDate}\n` +
    `Follow-up due date: ${c.followUpDate}\nDays overdue: ${c.overdueDays}\n` +
    `Rules: do NOT give medical advice or mention any diagnosis; ask how they are feeling; invite them to reply to book a visit. ` +
    `Output only the message text.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.AI_MODEL || 'claude-sonnet-4-5',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`AI API responded ${res.status}`);
  const data = await res.json();
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  if (!text) throw new Error('AI API returned empty text');
  return { source: 'ai', message: text };
}

async function generateDraft(patient, today) {
  if (!process.env.ANTHROPIC_API_KEY) return mockDraft(patient, today);
  try {
    return await aiDraft(patient, today);
  } catch (err) {
    console.warn(`[ai] falling back to mock draft: ${err.message}`);
    return mockDraft(patient, today);
  }
}

module.exports = { generateDraft, mockDraft };
