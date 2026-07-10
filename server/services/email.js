'use strict';

const nodemailer = require('nodemailer');
const db = require('../db');
const { logAction } = require('./activityLog');
const { getAllSettings } = require('../routes/settings');
const { gregorianToHebrewText } = require('./hebrewDates');
const { ageForEvent } = require('./age');

// בונה transport מתוך ההגדרות; מחזיר null אם SMTP לא הוגדר (מצב preview)
// הגדרות המייל: משתני סביבה קודמים להגדרות במסד הנתונים.
// כך בענן (Render) ההגדרות שורדות פריסה מחדש, גם כשהמסד מתאפס.
function mailConfig() {
  const s = getAllSettings();
  const env = process.env;
  return {
    host: env.SMTP_HOST || s.smtp_host,
    port: parseInt(env.SMTP_PORT || s.smtp_port || '587', 10),
    secure: String(env.SMTP_SECURE || s.smtp_secure) === 'true',
    user: env.SMTP_USER || s.smtp_user,
    pass: env.SMTP_PASS || s.smtp_pass,
    senderName: env.SENDER_NAME || s.sender_name || 'יומן אירועים',
    senderEmail: env.SENDER_EMAIL || s.sender_email || env.SMTP_USER || s.smtp_user,
  };
}

function buildTransport() {
  const c = mailConfig();
  if (!c.host || !c.user) return null;
  return nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.secure,
    auth: { user: c.user, pass: c.pass },
    // מגבלות זמן — כדי שכשל יחזור מהר עם שגיאה ברורה במקום להיתקע
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
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
    '{{location}}': escapeHtml(ctx.location || ''),
    '{{notes}}': escapeHtml(ctx.notes || ''),
  };
  const rawBody = template.body_html || '';
  let body = rawBody;
  let title = template.title || '';
  for (const [k, v] of Object.entries(replacements)) {
    body = body.split(k).join(v);
    title = title.split(k).join(v);
  }

  // מיקום והערות — נוספים אוטומטית אם קיימים ולא שולבו כבר בתבנית ידנית
  if (ctx.location && !rawBody.includes('{{location}}')) {
    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ctx.location)}`;
    body += `<p style="margin:16px 0 4px">📍 <b>מיקום:</b> ${escapeHtml(ctx.location)}</p>`
      + `<p style="margin:0"><a href="${mapUrl}" style="color:${accent};font-size:14px">🗺️ פתיחה ב-Google Maps</a></p>`;
  }
  if (ctx.notes && !rawBody.includes('{{notes}}')) {
    body += `<p style="margin:14px 0 0;padding:12px;background:#f6f8fc;border-radius:10px;color:#555;font-size:15px;text-align:right">`
      + `📝 ${escapeHtml(ctx.notes)}</p>`;
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
    location: event.location || '',
    notes: event.notes || '',
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
    || { title: event.title, body_html: '<p>{{title}} — {{hebrew_date}}</p>', signature: '' };
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
    : '') || mailConfig().senderEmail;

  const transport = buildTransport();
  if (!transport) {
    db.prepare('INSERT INTO EmailLog (to_addr, subject, status, error) VALUES (?,?,?,?)')
      .run(to || '', subject, 'preview', 'SMTP לא מוגדר — מצב תצוגה מקדימה');
    logAction(userId, 'email', 'email', `תצוגה מקדימה (SMTP לא מוגדר): ${subject}`);
    return { status: 'preview', html, subject, to };
  }

  try {
    await transport.sendMail({
      from: `"${mailConfig().senderName}" <${mailConfig().senderEmail}>`,
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

// שליחת עדכון מיקום לאירוע — פעולה נפרדת מהתזכורות
async function sendLocationEmail({ event, occurrenceDate, recipients, note, userId }) {
  const s = getAllSettings();
  const member = event.member_id ? db.prepare('SELECT * FROM FamilyMembers WHERE id = ?').get(event.member_id) : null;
  const name = member ? `${member.first_name} ${member.last_name || ''}`.trim() : '';
  const dateStr = occurrenceDate || event.gregorian_date || '';
  const location = event.location || '';
  const mapUrl = location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}` : '';
  const accent = s.primary_color || '#4f8cff';
  const signature = (s.signature || '').replace(/\n/g, '<br>');

  const subject = `📍 עדכון מיקום לאירוע: ${event.title}`;
  const html = `<!doctype html><html dir="rtl" lang="he"><body style="margin:0;padding:0;background:#eef1f6;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:560px;margin:24px auto;background:#fff;color:#222;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.12);">
      <div style="background:${accent};padding:24px 20px;text-align:center;color:#fff;">
        <h1 style="margin:0;font-size:22px;">📍 עדכון מיקום לאירוע</h1>
      </div>
      <div style="padding:24px 28px;line-height:1.8;font-size:16px;">
        <p style="margin:0 0 8px"><b>${escapeHtml(event.title)}</b>${name ? ' — ' + escapeHtml(name) : ''}</p>
        ${dateStr ? `<p style="margin:0 0 8px">🗓️ תאריך: ${escapeHtml(gregorianToHebrewText(dateStr))}</p>` : ''}
        <p style="margin:0 0 8px">📍 מיקום: <b>${escapeHtml(location) || 'טרם נקבע'}</b></p>
        ${mapUrl ? `<p style="margin:0 0 8px"><a href="${mapUrl}" style="color:${accent}">🗺️ פתיחה ב-Google Maps</a></p>` : ''}
        ${note ? `<p style="margin:14px 0 0;padding:12px;background:#f6f8fc;border-radius:10px">${escapeHtml(note)}</p>` : ''}
      </div>
      <div style="padding:16px 28px;border-top:1px solid #eee;color:#888;font-size:13px;text-align:center;">${signature}</div>
    </div>
  </body></html>`;

  const to = (recipients || '').trim();
  if (!to) return { status: 'error', error: 'לא צוינו נמענים' };

  const transport = buildTransport();
  if (!transport) {
    db.prepare('INSERT INTO EmailLog (to_addr, subject, status, error) VALUES (?,?,?,?)')
      .run(to, subject, 'preview', 'SMTP לא מוגדר — תצוגה מקדימה');
    logAction(userId, 'email', 'location', `תצוגה מקדימה של עדכון מיקום: ${event.title}`);
    return { status: 'preview', html, subject, to };
  }
  try {
    await transport.sendMail({
      from: `"${mailConfig().senderName}" <${mailConfig().senderEmail}>`,
      to, subject, html,
    });
    db.prepare('INSERT INTO EmailLog (to_addr, subject, status) VALUES (?,?,?)').run(to, subject, 'sent');
    logAction(userId, 'email', 'location', `עדכון מיקום נשלח אל ${to}: ${event.title}`);
    return { status: 'sent', html, subject, to };
  } catch (err) {
    db.prepare('INSERT INTO EmailLog (to_addr, subject, status, error) VALUES (?,?,?,?)').run(to, subject, 'failed', err.message);
    logAction(userId, 'error', 'location', `כשל שליחת מיקום: ${err.message}`);
    return { status: 'failed', html, subject, to, error: err.message };
  }
}

// מייל כללי (איפוס סיסמה / הזמנת משתמש) — לא קשור לאירועים
async function sendSystemEmail({ to, subject, title, bodyHtml, buttonText, buttonUrl, userId }) {
  const s = getAllSettings();
  const c = mailConfig();
  const accent = s.primary_color || '#4f8cff';
  const systemName = s.system_name || 'יומן אירועים משפחתי';

  const button = buttonUrl
    ? `<p style="text-align:center;margin:26px 0"><a href="${buttonUrl}" style="background:${accent};color:#fff;padding:13px 30px;border-radius:10px;text-decoration:none;font-size:16px;display:inline-block">${escapeHtml(buttonText || 'המשך')}</a></p>`
      + `<p style="font-size:12px;color:#999;text-align:center;word-break:break-all">אם הכפתור לא עובד, העתיקו את הכתובת:<br>${escapeHtml(buttonUrl)}</p>`
    : '';

  const html = `<!doctype html><html dir="rtl" lang="he"><body style="margin:0;padding:0;background:#eef1f6;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:560px;margin:24px auto;background:#fff;color:#222;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.12);">
      <div style="background:${accent};padding:24px 20px;text-align:center;color:#fff;">
        <h1 style="margin:0;font-size:22px;">${escapeHtml(title)}</h1>
      </div>
      <div style="padding:24px 28px;line-height:1.8;font-size:16px;">
        ${bodyHtml}
        ${button}
      </div>
      <div style="padding:16px 28px;border-top:1px solid #eee;color:#888;font-size:13px;text-align:center;">${escapeHtml(systemName)}</div>
    </div>
  </body></html>`;

  const transport = buildTransport();
  if (!transport) {
    db.prepare('INSERT INTO EmailLog (to_addr, subject, status, error) VALUES (?,?,?,?)')
      .run(to, subject, 'preview', 'SMTP לא מוגדר');
    return { status: 'preview', html, to };
  }
  try {
    await transport.sendMail({ from: `"${c.senderName}" <${c.senderEmail}>`, to, subject, html });
    db.prepare('INSERT INTO EmailLog (to_addr, subject, status) VALUES (?,?,?)').run(to, subject, 'sent');
    logAction(userId, 'email', 'system', `${subject} -> ${to}`);
    return { status: 'sent', to };
  } catch (err) {
    db.prepare('INSERT INTO EmailLog (to_addr, subject, status, error) VALUES (?,?,?,?)').run(to, subject, 'failed', err.message);
    logAction(userId, 'error', 'system', `כשל שליחה: ${err.message}`);
    return { status: 'failed', error: err.message };
  }
}

module.exports = {
  renderTemplate, buildContext, pickTemplate, sendEventEmail, sendLocationEmail,
  sendSystemEmail, buildTransport, mailConfig,
};
