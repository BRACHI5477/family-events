'use strict';

const nodemailer = require('nodemailer');
const db = require('../db');
const { logAction } = require('./activityLog');
const { getAllSettings } = require('../routes/settings');
const { gregorianToHebrewText } = require('./hebrewDates');
const { ageForEvent } = require('./age');

// בונה transport מתוך ההגדרות; מחזיר null אם SMTP לא הוגדר (מצב preview)
function buildTransport() {
  const s = getAllSettings();
  if (!s.smtp_host || !s.smtp_user) return null;
  return nodemailer.createTransport({
    host: s.smtp_host,
    port: parseInt(s.smtp_port || '587', 10),
    secure: String(s.smtp_secure) === 'true',
    auth: { user: s.smtp_user, pass: s.smtp_pass },
  });
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// מילוי placeholders ועיצוב ה-HTML הסופי של המייל
function renderTemplate(template, ctx) {
  const s = getAllSettings();
  const signature = (template.signature || s.signature || '').replace(/\n/g, '<br>');
  const accent = template.accent_color || s.primary_color || '#4f8cff';
  const bg = template.bg_color || '#ffffff';
  const text = template.text_color || '#222222';

  const replacements = {
    '{{name}}': escapeHtml(ctx.name || ''),
    '{{title}}': escapeHtml(ctx.title || ''),
    '{{age}}': ctx.age != null ? escapeHtml(ctx.age) : '',
    '{{date}}': escapeHtml(ctx.date || ''),
    '{{hebrew_date}}': escapeHtml(ctx.hebrew_date || ''),
  };
  let body = template.body_html || '';
  let title = template.title || '';
  for (const [k, v] of Object.entries(replacements)) {
    body = body.split(k).join(v);
    title = title.split(k).join(v);
  }

  const photo = ctx.photo
    ? `<img src="${ctx.photo}" alt="" style="width:110px;height:110px;border-radius:50%;object-fit:cover;border:4px solid ${accent};margin:8px auto;display:block;">`
    : '';
  const bgImage = template.bg_image
    ? `background-image:url('${template.bg_image}');background-size:cover;background-position:center;`
    : '';

  return `<!doctype html><html dir="rtl" lang="he"><body style="margin:0;padding:0;background:#eef1f6;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:24px auto;background:${bg};color:${text};border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.12);">
    <div style="${bgImage}background-color:${accent};padding:28px 20px;text-align:center;color:#fff;">
      <h1 style="margin:0;font-size:24px;">${escapeHtml(title)}</h1>
    </div>
    <div style="padding:24px 28px;text-align:center;line-height:1.7;font-size:16px;">
      ${photo}
      ${body}
    </div>
    <div style="padding:16px 28px;border-top:1px solid #eee;color:#888;font-size:13px;text-align:center;">
      ${signature}
    </div>
  </div>
</body></html>`;
}

// בונה הקשר (context) לאירוע ולתאריך מופע
function buildContext(event, occurrenceDate) {
  const member = event.member_id ? db.prepare('SELECT * FROM FamilyMembers WHERE id = ?').get(event.member_id) : null;
  const from = occurrenceDate ? new Date(occurrenceDate + 'T12:00:00') : new Date();
  const age = member ? ageForEvent(event, member, from) : { greg: null, hebrew: null };
  let image = null;
  if (member && member.image_id) {
    const img = db.prepare('SELECT data_url FROM Images WHERE id = ?').get(member.image_id);
    image = img ? img.data_url : null;
  }
  const dateStr = occurrenceDate || event.gregorian_date || '';
  return {
    name: member ? `${member.first_name} ${member.last_name || ''}`.trim() : event.title,
    title: event.title,
    age: event.calc_mode === 'hebrew' ? age.hebrew : age.greg,
    date: dateStr,
    hebrew_date: dateStr ? gregorianToHebrewText(dateStr) : '',
    photo: image,
  };
}

// בחירת תבנית לאירוע (מפורש בכלל התזכורת, אחרת ברירת מחדל של הסוג)
function pickTemplate(event, templateId) {
  if (templateId) {
    const t = db.prepare('SELECT * FROM EmailTemplates WHERE id = ?').get(templateId);
    if (t) return t;
  }
  const type = event.type_id ? db.prepare('SELECT * FROM EventTypes WHERE id = ?').get(event.type_id) : null;
  if (type && type.default_template_id) {
    const t = db.prepare('SELECT * FROM EmailTemplates WHERE id = ?').get(type.default_template_id);
    if (t) return t;
  }
  return db.prepare('SELECT * FROM EmailTemplates WHERE type_id = ? AND active = 1').get(event.type_id)
    || { title: event.title, body_html: '<p>{{title}} — {{date}}</p>', signature: '' };
}

// שליחה בפועל (או preview). מחזיר { status, html, subject }
async function sendEventEmail({ event, occurrenceDate, templateId, recipients, userId }) {
  const template = pickTemplate(event, templateId);
  const ctx = buildContext(event, occurrenceDate);
  const html = renderTemplate(template, ctx);
  const subject = (template.title || event.title).replace('{{name}}', ctx.name).replace('{{title}}', ctx.title);
  const s = getAllSettings();
  const to = recipients || (event.member_id
    ? (db.prepare('SELECT email FROM FamilyMembers WHERE id = ?').get(event.member_id) || {}).email
    : '') || s.sender_email;

  const transport = buildTransport();
  if (!transport) {
    db.prepare('INSERT INTO EmailLog (to_addr, subject, status, error) VALUES (?,?,?,?)')
      .run(to || '', subject, 'preview', 'SMTP לא מוגדר — מצב תצוגה מקדימה');
    logAction(userId, 'email', 'email', `תצוגה מקדימה (SMTP לא מוגדר): ${subject}`);
    return { status: 'preview', html, subject, to };
  }

  try {
    await transport.sendMail({
      from: `"${s.sender_name || 'יומן אירועים'}" <${s.sender_email || s.smtp_user}>`,
      to,
      subject,
      html,
    });
    db.prepare('INSERT INTO EmailLog (to_addr, subject, status) VALUES (?,?,?)').run(to, subject, 'sent');
    logAction(userId, 'email', 'email', `מייל נשלח אל ${to}: ${subject}`);
    return { status: 'sent', html, subject, to };
  } catch (err) {
    db.prepare('INSERT INTO EmailLog (to_addr, subject, status, error) VALUES (?,?,?,?)')
      .run(to || '', subject, 'failed', err.message);
    logAction(userId, 'error', 'email', `כשל שליחת מייל: ${err.message}`);
    return { status: 'failed', html, subject, to, error: err.message };
  }
}

module.exports = { renderTemplate, buildContext, pickTemplate, sendEventEmail, buildTransport };
