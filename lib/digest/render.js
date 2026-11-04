'use strict';

const { longDate, shortDate } = require('./time');

/* Draws a digest ({ sections, empty }) as an email: HTML plus a plain-text fallback.

   The look borrows from paper planners and to-do apps: a tear-off calendar tile for the date, soft cards, empty
   checkbox circles for things to do, a colored timeline for classes, and a small agenda for the days ahead.

   Email clients are picky, so the HTML sticks to what works nearly everywhere: nested tables, inline styles, no
   images, no scripts, no web fonts. A small <style> block adds dark mode where the client supports it (Apple Mail,
   Gmail apps); clients that ignore it simply show the light version. Everything that comes from your data is
   escaped before it goes into the HTML. */

const INK = '#2a2620';
const MUTED = '#787063';
const FAINT = '#a39a8b';
const PAPER = '#f7f4ed';
const CARD = '#fffdf8';
const SOFT = '#f1ede3';
const LINE = '#e7e0d2';
const BAD = '#a64c34';
const BAD_TINT = '#fbf0ec';
const BAD_LINE = '#efd5cb';
const BRAND = '#6b5d45';
const GOOD = '#4f7355';

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";

const AREA_COLOR = {
  Academics: '#43607f', 'Life Admin': '#9c6a4c', Career: '#4f7355', People: '#7c5875', Personal: '#927b41',
  'Bills due soon': '#9c6a4c', 'Waiting to hear back': '#4f7355', 'People to follow up with': '#7c5875',
};
const SECTION_COLOR = { classes: '#43607f', overdue: BAD, today: BRAND, soon: '#927b41', radar: '#7c5875' };
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const esc = escapeHtml;

const subjectFor = (today) => `Your day: ${shortDate(today)}`;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const countRows = (section) => (section ? section.groups.reduce((n, g) => n + g.rows.length, 0) + (section.more || 0) : 0);
const compactLate = (tag) => (/^(\d+) days? overdue$/.exec(tag || '') ? `${/^(\d+)/.exec(tag)[1]}d late` : tag);

/* ------------------------------------------------------------------ small pieces */

const dot = (color, size = 8) =>
  `<span style="display:inline-block;width:${size}px;height:${size}px;border-radius:50%;background:${color};vertical-align:middle;margin-right:7px"></span>`;

/* an empty to-do circle, the way a checklist shows something not done yet */
const circle = (color) =>
  `<span style="display:inline-block;width:15px;height:15px;border:1.6px solid ${color};border-radius:50%;box-sizing:border-box"></span>`;

function chip(text, tone) {
  if (!text) return '';
  return tone === 'bad'
    ? `<span class="bad-chip" style="display:inline-block;padding:2px 9px;border-radius:999px;background:#ffffff;border:1px solid ${BAD_LINE};font:600 11px ${SANS};color:${BAD};white-space:nowrap">${esc(text)}</span>`
    : `<span class="chip" style="display:inline-block;padding:2px 9px;border-radius:999px;background:${SOFT};font:600 11px ${SANS};color:${MUTED};white-space:nowrap">${esc(text)}</span>`;
}

function card(title, count, color, body, { bad = false } = {}) {
  const cls = bad ? 'card bad-card' : 'card';
  const bg = bad ? BAD_TINT : CARD;
  const border = bad ? BAD_LINE : LINE;
  return `<tr><td style="padding:0 0 12px">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="${cls}" style="background:${bg};border:1px solid ${border};border-radius:14px">`
    + `<tr><td style="padding:14px 16px 12px">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>`
    + `<td style="font:700 11px ${SANS};letter-spacing:.13em;text-transform:uppercase;color:${bad ? BAD : MUTED}" class="${bad ? '' : 'muted'}">${dot(color)}${esc(title)}</td>`
    + `<td align="right">${count ? chip(String(count), bad ? 'bad' : '') : ''}</td>`
    + `</tr></table>`
    + `<div style="height:8px;line-height:8px;font-size:8px">&nbsp;</div>`
    + `${body}</td></tr></table></td></tr>`;
}

function groupLabel(label) {
  const color = AREA_COLOR[label] || FAINT;
  return `<tr><td colspan="3" style="padding:10px 0 3px;font:700 10.5px ${SANS};letter-spacing:.12em;text-transform:uppercase;color:${FAINT}" class="faint">${dot(color, 7)}${esc(label)}</td></tr>`;
}

function moreNote(section) {
  return section.more > 0
    ? `<div style="font:12px ${MONO};color:${FAINT};padding-top:6px" class="faint">+ ${section.more} more on the site</div>` : '';
}

/* ------------------------------------------------------------------ header */

function header(digest) {
  const [, month, day] = digest.today.split('-').map(Number);
  const weekday = longDate(digest.today).split(',')[0];
  const classes = digest.sections.find((s) => s.id === 'classes');
  const n = (id) => countRows(digest.sections.find((s) => s.id === id));

  const chips = [];
  if (n('classes')) chips.push(chip(plural(n('classes'), 'class', 'classes')));
  if (n('today')) chips.push(chip(`${n('today')} due today`));
  if (n('overdue')) chips.push(chip(`${n('overdue')} overdue`, 'bad'));
  const firstUp = classes ? classes.groups[0].rows[0] : null;

  const tile = `<table role="presentation" cellpadding="0" cellspacing="0" class="card" style="width:78px;background:${CARD};border:1px solid ${LINE};border-radius:12px;border-collapse:separate;overflow:hidden">`
    + `<tr><td align="center" style="background:${BRAND};border-radius:11px 11px 0 0;padding:5px 0 4px;font:700 10px ${SANS};letter-spacing:.2em;color:#fbf8f1">${MONTHS[month - 1]}</td></tr>`
    + `<tr><td align="center" class="ink" style="padding:7px 0 8px;font:700 34px/1 ${SERIF};color:${INK}">${day}</td></tr></table>`;

  return `<tr><td style="padding:2px 0 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>`
    + `<td valign="middle" width="92">${tile}</td>`
    + `<td valign="middle">`
    + `<div class="muted" style="font:700 11px ${SANS};letter-spacing:.16em;text-transform:uppercase;color:${MUTED}">${esc(weekday)}</div>`
    + `<div class="ink" style="font:700 24px/1.2 ${SERIF};color:${INK};padding:2px 0 6px">Good morning</div>`
    + (chips.length ? `<div style="line-height:26px">${chips.join(' &nbsp;')}</div>` : '')
    + (firstUp ? `<div class="muted" style="font:13px ${SANS};color:${MUTED};padding-top:4px">First up: ${esc(firstUp.start)} · ${esc(firstUp.subject)}</div>` : '')
    + `</td></tr></table></td></tr>`;
}

/* ------------------------------------------------------------------ section bodies */

/* classes: a timeline. Start time on the left, a bar in the subject's color, then the name and room. */
function classesBody(section) {
  return section.groups[0].rows.map((row) => {
    const place = row.tag ? ` &nbsp;${chip(row.tag)}` : '';
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px"><tr>`
      + `<td valign="top" width="78" class="ink" style="padding:2px 10px 2px 0;font:700 13px/1.3 ${MONO};color:${INK}">${esc(row.start)}`
      + `<div class="muted" style="font:400 11.5px/1.3 ${MONO};color:${MUTED}">${row.end ? `to ${esc(row.end)}` : '&nbsp;'}</div></td>`
      + `<td width="4" style="background:${row.accent};border-radius:3px;font-size:1px;line-height:1px">&nbsp;</td>`
      + `<td valign="top" style="padding:1px 0 1px 12px">`
      + `<div class="ink" style="font:600 15px/1.35 ${SANS};color:${INK}">${esc(row.subject)}</div>`
      + `<div class="muted" style="font:13px/1.5 ${SANS};color:${MUTED}">${esc(row.kindOf || 'Class')}${place}</div></td>`
      + `</tr></table>`;
  }).join('');
}

/* to-do style checklist, grouped by area: an empty circle, the text, and a chip on the right */
function checklistBody(section, { bad = false } = {}) {
  const rows = section.groups.map((group) => {
    const items = group.rows.map((row) => {
      const right = bad ? chip(compactLate(row.tag), 'bad') : chip(row.time || row.lead || '');
      return `<tr>`
        + `<td valign="top" width="26" style="padding:7px 0 0">${circle(bad ? BAD : (AREA_COLOR[group.label] || MUTED))}</td>`
        + `<td valign="top" class="ink" style="padding:5px 8px 5px 0;font:15px/1.4 ${SANS};color:${INK}">${esc(row.text)}</td>`
        + `<td valign="top" align="right" style="padding:5px 0">${right}</td></tr>`;
    }).join('');
    return `${groupLabel(group.label)}${items}`;
  }).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>${moreNote(section)}`;
}

/* the days ahead: a small date tile per day, then what's on it */
function agendaBody(section) {
  const days = [];
  for (const row of section.groups[0].rows) {
    const last = days[days.length - 1];
    if (last && last.date === row.date) last.rows.push(row); else days.push({ date: row.date, rows: [row] });
  }
  const out = days.map((day) => {
    const [, , dayNumber] = day.date.split('-').map(Number);
    const weekday = shortDate(day.date).split(',')[0].toUpperCase();
    const items = day.rows.map((row) =>
      `<tr><td valign="top" width="14" style="padding:9px 0 0">${dot(AREA_COLOR[row.area] || FAINT, 7)}</td>`
      + `<td valign="top" class="ink" style="padding:2px 8px 2px 0;font:15px/1.4 ${SANS};color:${INK}">${esc(row.text)}</td>`
      + `<td align="right" valign="top" style="padding:2px 0">${chip(row.time)}</td></tr>`).join('');
    return `<tr><td valign="top" width="46" style="padding:6px 0 8px">`
      + `<div class="muted" style="font:700 10px ${SANS};letter-spacing:.12em;color:${MUTED}">${weekday}</div>`
      + `<div class="ink" style="font:700 21px/1 ${SERIF};color:${INK}">${dayNumber}</div></td>`
      + `<td valign="top" class="rule" style="padding:6px 0 8px 12px;border-left:1px solid ${LINE}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items}</table></td></tr>`;
  }).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${out}</table>${moreNote(section)}`;
}

function radarBody(section) {
  const blocks = section.groups.map((group) => {
    const color = AREA_COLOR[group.label] || FAINT;
    const items = group.rows.map((row) =>
      `<tr><td class="ink" style="padding:2px 8px 2px 0;font:15px/1.4 ${SANS};color:${INK}">${esc(row.text)}</td>`
      + `<td align="right" valign="top" style="padding:2px 0">${chip(row.tag || row.lead)}</td></tr>`).join('');
    return `<div class="faint" style="font:700 10.5px ${SANS};letter-spacing:.12em;text-transform:uppercase;color:${FAINT};padding:8px 0 2px">${dot(color, 7)}${esc(group.label)}</div>`
      + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items}</table>`;
  }).join('');
  return blocks;
}

const BODY = { classes: classesBody, overdue: (s) => checklistBody(s, { bad: true }), today: (s) => checklistBody(s), soon: agendaBody, radar: radarBody };

function clearCard() {
  return `<tr><td style="padding:0 0 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="card" style="background:${CARD};border:1px solid ${LINE};border-radius:14px"><tr><td align="center" style="padding:26px 18px 24px">`
    + `<div style="width:46px;height:46px;line-height:46px;border-radius:50%;background:#e6efe7;color:${GOOD};font:700 24px/46px ${SANS};text-align:center;margin:0 auto 10px">&#10003;</div>`
    + `<div class="ink" style="font:700 22px ${SERIF};color:${INK}">Clear day</div>`
    + `<div class="muted" style="font:14px/1.5 ${SANS};color:${MUTED};padding-top:4px">No classes, nothing due, nothing overdue.</div>`
    + `</td></tr></table></td></tr>`;
}

function footer(siteUrl) {
  const button = siteUrl
    ? `<a href="${esc(siteUrl)}" style="display:inline-block;padding:10px 20px;border-radius:9px;background:${BRAND};color:#fbf8f1;font:600 14px ${SANS};text-decoration:none">Open Marginalia</a>` : '';
  return `<tr><td align="center" style="padding:10px 0 0">${button}`
    + `<div class="faint" style="font:12px ${SANS};color:${FAINT};padding-top:${siteUrl ? 12 : 0}px">Your morning digest from Marginalia</div></td></tr>`;
}

/* ------------------------------------------------------------------ the email */

const DARK_MODE = `@media (prefers-color-scheme: dark){`
  + `.bg{background:#17150f !important}.card{background:#201d16 !important;border-color:#2f2a20 !important}`
  + `.ink{color:#ece5d6 !important}.muted{color:#9a9080 !important}.faint{color:#7a705f !important}.rule{border-color:#3b3427 !important}`
  + `.chip{background:#2c271d !important;color:#c9bfae !important}`
  + `.bad-card{background:#2b1a15 !important;border-color:#4a2a22 !important}.bad-chip{background:#3a2019 !important;border-color:#5a3328 !important;color:#e8917a !important}}`;

function renderHtml(digest, { siteUrl }) {
  const cards = digest.empty
    ? clearCard()
    : digest.sections.map((section) =>
      card(section.title, countRows(section), SECTION_COLOR[section.id] || MUTED, BODY[section.id](section), { bad: section.id === 'overdue' })).join('');
  const title = subjectFor(digest.today);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${esc(title)}</title>`
    + `<style>${DARK_MODE}</style></head>`
    + `<body class="bg" style="margin:0;padding:0;background:${PAPER}">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="bg" style="background:${PAPER}"><tr><td align="center" style="padding:22px 14px 32px">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px">`
    + `<tr><td class="muted" style="padding:0 0 12px;font:700 14px ${SERIF};letter-spacing:.02em;color:${MUTED}">Marginalia<span style="color:${BRAND}">.</span></td></tr>`
    + `${header(digest)}${cards}${footer(siteUrl)}`
    + `</table></td></tr></table></body></html>`;
}

/* ------------------------------------------------------------------ plain text */

function renderText(digest, { siteUrl }) {
  const n = (id) => countRows(digest.sections.find((s) => s.id === id));
  const summary = [n('classes') && plural(n('classes'), 'class', 'classes'), n('today') && `${n('today')} due today`,
                   n('overdue') && `${n('overdue')} overdue`].filter(Boolean).join(' · ');
  const lines = [`YOUR DAY: ${longDate(digest.today)}`];
  if (summary) lines.push(summary);
  lines.push('');

  if (digest.empty) {
    lines.push('Clear day. No classes, nothing due, nothing overdue.');
  } else {
    for (const section of digest.sections) {
      lines.push(section.title.toUpperCase());
      const todo = section.id === 'overdue' || section.id === 'today';      // things to tick off get a checkbox
      for (const group of section.groups) {
        if (group.label) lines.push(`  ${group.label}`);
        for (const row of group.rows) {
          const indent = group.label ? '    ' : '  ';
          const box = todo ? '[ ] ' : '';
          lines.push(`${indent}${box}${[row.lead, row.text, row.tag && `(${row.tag})`].filter(Boolean).join('  ')}`);
        }
      }
      if (section.more > 0) lines.push(`  + ${section.more} more on the site`);
      lines.push('');
    }
  }
  if (siteUrl) lines.push(siteUrl);
  return lines.join('\n').trim() + '\n';
}

function renderDigest(digest, { siteUrl = '' } = {}) {
  return { subject: subjectFor(digest.today), html: renderHtml(digest, { siteUrl }), text: renderText(digest, { siteUrl }) };
}

module.exports = { renderDigest, escapeHtml, subjectFor };
